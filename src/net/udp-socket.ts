import assert from "assert/strict";
import {Buffer} from "buffer";
import _ from "lodash";
import MapUtil from "../collection-utils/map-util.js";
import Task from "../game-loop/task.js";
import Timeout from "../game-loop/timeout.js";
import Session from "./session.js";
import UDP from "./udp.js";

/** Received message with header */
interface ReceivedMessage {
	/** Message id (sequence number). Consists of 1 byte */
	messageId: number;
	/**
	 * The part number. Equals to 0 for small messages consisting of 1 part.
	 * Big messages start with the 1st part, not with 0th. Consists of 1 byte.
	 */
	partNum: number;
	/** For divided messages, the third byte of the first part contains the part count. Consists of 1 byte */
	partCount?: number;
	/**
	 * The first bytes of the token needed to make IP spoofing more difficult.
	 * Consists of {@link UDPSocket.TOKEN_PREFIX_SIZE} bytes
	 */
	tokenPrefix: Buffer;
	/**
	 * Content of a message or its part (for big messages).
	 * Consists of remaining bytes up to {@link UDP.MAX_SAFE_PACKET_SIZE} bytes
	 */
	content: Buffer;
}

/**
 * UDP socket class. Emulates a connection like in TCP implementing all missing features
 * (reliability, no duplicates, splitting big messages into many small ones).
 * Also, it can reorder the messages if necessary
 * (so that the server receives them in the same order as the client sent them).
 */
export default class UDPSocket {
	/** Client IP address */
	public readonly address: string;
	/** Client port */
	public readonly port: number;
	public session?: Session;
	private static readonly MAX_MESSAGE_ID = 255;
	/** How many recent statistics entries should be stored */
	private static readonly HISTORY_LENGTH = 32;
	private closed = false;

	// Receiving
	/** See {@link ReceivedMessage.tokenPrefix} */
	private static readonly TOKEN_PREFIX_SIZE = 2;
	/**
	 * The header size of a received message.
	 * For big messages, the first packet is 1 byte longer as it will contain the part count.
	 */
	private static readonly RECEIVED_HEADER_SIZE = 2 + UDPSocket.TOKEN_PREFIX_SIZE;
	/** Message IDs of last received messages (for duplicate checking) */
	private readonly receivedMessages: number[] = [];
	/** Parts of big messages are collected here before all parts are received */
	private readonly bigMessages = new Map<number, Buffer[]>;
	/** The time the last message was received */
	private lastReceivedTime = Date.now();
	/** Since which time the client sent {@link UDPSocket.receivedBytes} bytes */
	private receivedSince = Date.now();
	/** How many bytes the client sent since {@link UDPSocket.receivedSince} */
	private receivedBytes = 0;

	// Receiving in correct order
	/** The messages are queued here to wait for missing messages and process them in the correct order */
	private readonly queuedForCorrectOrder = new Map<number, Buffer>;
	/** The id of next message in the correct order */
	private nextToReceive = 1;
	/**
	 * Since which time the server waits for the next message in the correct order.
	 * See also {@link UDP.shouldWaitForNext}
	 */
	private waitingForNextSince = Date.now();

	// Sending
	/**
	 * The header size of a sent message.
	 * For big messages, the first packet is 1 byte longer as it will contain the part count.
	 */
	private static readonly SENT_HEADER_SIZE = 2;
	/** How often the server should ping the client (in ms) */
	private static readonly AUTOPING = Math.round(UDP.sessionTimeout / UDP.attemptCount);
	/** The task that pings the client */
	private readonly pingTask = Task.create(this.ping.bind(this), {frequency: UDPSocket.AUTOPING});
	/** The send time is stored here until an acknowledgment is received */
	private readonly sendTime = new Map<number, number>;
	/** Statistics on how long the server waited for an acknowledgment */
	private readonly timesUntilAcknowledgment: number[] = [];
	/** The time the last message was sent */
	private lastSendTime = Date.now();
	/** The message id of the last sent message */
	private lastMessageId = 0;

	/** Calculates the max. possible size of a sent message consisting of `packetCount` packets */
	public static calcMessageSize(packetCount: number): number {
		const singlePacketSize = UDP.MAX_SAFE_PACKET_SIZE - UDPSocket.SENT_HEADER_SIZE;
		const partCountByte = (packetCount > 1 ? 1 : 0);
		return packetCount * singlePacketSize - partCountByte;
	}

	/** Creates a UDP socket with the given IP address and port */
	public constructor(address: string, port: number) {
		this.address = address;
		this.port = port;
	}

	/** Closes this UDP socket. By default, it will notify the client with {@link UDPSocket.sendError} */
	public close(shouldNotifyClient = true): void {
		assert(!this.closed);
		this.session?.unbindUdpSocket();
		UDP.removeSocket(this);
		this.pingTask.stop();
		if (shouldNotifyClient) {
			this.sendError();
		}
		this.closed = true;
	}

	/** Sends a message of arbitrary size to this socket */
	public send(fullMessage: Buffer): void {
		assert(!this.closed);

		const maxLength = (UDP.MAX_SAFE_PACKET_SIZE - UDPSocket.SENT_HEADER_SIZE) * UDPSocket.MAX_MESSAGE_ID - 1;
		assert(
			fullMessage.length <= maxLength,
			`The length ${fullMessage.length} is too big (max length is ${maxLength}).`
		);

		const parts: Buffer[] = [];
		while (fullMessage.length > 0) {
			const partSize = UDP.MAX_SAFE_PACKET_SIZE - UDPSocket.SENT_HEADER_SIZE - (parts.length < 1 ? 1 : 0);
			parts.push(fullMessage.subarray(0, partSize));
			fullMessage = fullMessage.subarray(partSize);
		}

		let partNum = (parts.length > 1 ? 1 : 0);
		for (const content of parts) {
			this.sendPart(content, partNum, parts.length);
			partNum++;
		}
	}

	/** Reacts to the received message depending on its content */
	public async receive(message: Buffer): Promise<void> {
		assert(!this.closed);
		this.lastReceivedTime = Date.now();
		if (Date.now() - this.receivedSince >= 1000) {
			this.receivedSince = Date.now();
			this.receivedBytes = 0;
		}
		this.receivedBytes += message.length;
		if (this.receivedBytes > UDP.receiveMaxBytesPerSecond) {
			return UDP.logger.warn(`Limit reached: received ${this.receivedBytes} bytes.`);
		}

		// Session authentication or ping
		const messageId = message.readUIntBE(0, 1);
		if (messageId == 0) {
			const token = message.subarray(1);
			if (token.length > 0) { // If not ping
				this.establishSession(token);
			}
			return;
		}

		// Parsing
		if (message.length < UDPSocket.RECEIVED_HEADER_SIZE) {
			return UDP.logger.debug(`The received message is too short (length ${message.length}).`);
		}
		const received = UDPSocket.parseReceivedMessage(message);

		// Check token prefix
		const rightTokenPrefix = this.session?.token.subarray(0, UDPSocket.TOKEN_PREFIX_SIZE);
		if (!this.session || !rightTokenPrefix?.equals(received.tokenPrefix)) {
			this.sendError();
			return UDP.logger.debug(`No session or wrong token prefix for message id ${messageId}.`);
		}

		// Server got an acknowledgment
		const sendTime = this.sendTime.get(messageId);
		if (message.length <= UDPSocket.RECEIVED_HEADER_SIZE) {
			if (sendTime !== undefined) {
				UDPSocket.addEntryToHistory(this.timesUntilAcknowledgment, Date.now() - sendTime);
				this.sendTime.delete(messageId);
			}
			return;
		}

		// Server got a message
		this.sendAcknowledgment(messageId);
		if (this.receivedMessages.includes(messageId)) {
			return; // Duplicate
		}
		UDPSocket.addEntryToHistory(this.receivedMessages, messageId);
		await this.processReceivedMessage(received);
	}

	/** Calculates the next message ID. If {@link UDPSocket.MAX_MESSAGE_ID} is already reached, starts with 1 */
	private static getNextId(messageId: number): number {
		return (messageId >= UDPSocket.MAX_MESSAGE_ID ? 1 : messageId + 1);
	}

	/**
	 * Adds a new entry to the given array and removes its first element,
	 * if its length exceeds {@link UDPSocket.HISTORY_LENGTH}
	 */
	private static addEntryToHistory(array: number[], newEntry: number): void {
		array.push(newEntry);
		if (array.length > UDPSocket.HISTORY_LENGTH) {
			array.shift();
		}
	}

	/** Parses the header information and content of a received message, see {@link ReceivedMessage} */
	private static parseReceivedMessage(message: Buffer): ReceivedMessage {
		const messageId = message.readUIntBE(0, 1);
		const partNum = message.readUIntBE(1, 1);
		const offset = (partNum == 1 ? 1 : 0);
		const partCount = (partNum == 1 ? message.readUIntBE(2, 1) : undefined);
		const tokenPrefix = message.subarray(2 + offset, 2 + offset + UDPSocket.TOKEN_PREFIX_SIZE);
		const content = message.subarray(UDPSocket.RECEIVED_HEADER_SIZE + offset);
		return {messageId, partNum, partCount, tokenPrefix, content};
	}

	/** Processes the received message or its part. Reorders the messages to receive them again in the correct order */
	private async processReceivedMessage({messageId, partNum, partCount, content}: ReceivedMessage): Promise<void> {
		assert(this.session);
		if (partNum > 0) {
			const firstId = messageId - partNum + 1 + (messageId < partNum ? UDPSocket.MAX_MESSAGE_ID : 0);
			const parts = MapUtil.getArray(this.bigMessages, firstId);
			if (partCount) {
				parts.length = partCount;
			}
			parts[partNum - 1] = content;

			if (Object.keys(parts).length == parts.length) { // No empty slots
				const fullMessage = Buffer.concat(parts);
				this.bigMessages.delete(firstId);
				await this.session.receive(fullMessage, false);
				this.queuedForCorrectOrder.set(messageId, fullMessage);
				const emptyBuffer = Buffer.alloc(0);
				for (let i = 1, nextMessageId = messageId; i < parts.length; i++) {
					nextMessageId = UDPSocket.getNextId(nextMessageId);
					this.queuedForCorrectOrder.set(nextMessageId, emptyBuffer);
				}
			}
		} else {
			await this.session.receive(content, false);
			this.queuedForCorrectOrder.set(messageId, content);
		}

		if (Date.now() - this.waitingForNextSince > UDP.shouldWaitForNext && this.queuedForCorrectOrder.size > 0) {
			const ids = Array.from(this.queuedForCorrectOrder.keys()).sort((a, b) => a - b);
			this.nextToReceive = ids.find(id => id > this.nextToReceive) || Math.min(...ids) || 1;
		}
		const newMessages: Buffer[] = [];
		let nextMessage;
		while ((nextMessage = this.queuedForCorrectOrder.get(this.nextToReceive)) != undefined) {
			this.queuedForCorrectOrder.delete(this.nextToReceive);
			if (nextMessage.length > 0) {
				newMessages.push(nextMessage);
			}
			this.nextToReceive = UDPSocket.getNextId(this.nextToReceive);
		}
		this.waitingForNextSince = (this.queuedForCorrectOrder.size > 0 ? Date.now() : Infinity);
		for (const newMessage of newMessages) {
			await this.session.receive(newMessage, true);
		}
	}

	/** Establishes a session with the given token */
	private establishSession(token: Buffer): void {
		const session = Session.getByToken(token);
		if (!session) {
			this.sendError();
			return UDP.logger.debug(`Wrong session token ${token}.`);
		}
		session.bindUdpSocket(this);
		this.sendAcknowledgment(0);
		this.nextToReceive = 1;
	}

	/** Sends an acknowledgment to the client that the message with the id `messageId` was received */
	private sendAcknowledgment(messageId: number): void {
		this.lastSendTime = Date.now();
		UDP.send(this.address, this.port, Buffer.from([messageId]));
	}

	/** Sends an error to the client to reestablish the session (the client is requested to resend the session token) */
	private sendError(): void {
		this.lastSendTime = Date.now();
		UDP.send(this.address, this.port, Buffer.from([0, 0]));
	}

	/** Sends a part of the big message (this can be a whole message as well, if it is small) */
	private sendPart(partContent: Buffer, partNum: number, partCount: number): void {
		this.lastMessageId = UDPSocket.getNextId(this.lastMessageId);
		const messageId = this.lastMessageId;

		const header = [messageId, partNum];
		if (partNum == 1) {
			header.push(partCount);
		}
		const message = Buffer.concat([Buffer.from(header), partContent]);

		if (this.sendTime.has(messageId)) {
			return UDP.logger.debug(`Buffer overflow: too many UDP messages (message id ${messageId}).`);
		}
		const sendTime = Date.now();
		this.sendTime.set(messageId, sendTime);
		this.trySendPart(message, messageId, sendTime);
	}

	/**
	 * Makes an attempt to send a datagram.
	 * It creates a timeout to retry sending the message if the client hasn't sent an acknowledgment.
	 * It makes max. {@link UDP.attemptCount} attempts.
	 * If all attempts fail and {@link UDP.sessionTimeout} ms have passed since the last received message,
	 * it closes the UDP socket.
	 */
	private trySendPart(message: Buffer, messageId: number, sendTime: number, attempt = 1): void {
		if (this.sendTime.get(messageId) != sendTime) {
			return;
		} else if (attempt > UDP.attemptCount) {
			this.sendTime.delete(messageId);
			if (Date.now() - this.lastReceivedTime > UDP.sessionTimeout) {
				this.close(false);
			}
			return;
		}
		this.lastSendTime = Date.now();
		UDP.send(this.address, this.port, message, () => {
			Timeout.create(() => {
				this.trySendPart(message, messageId, sendTime, attempt + 1);
			}, this.calcTimeUntilNextAttempt(attempt));
		});
	}

	/**
	 * Calculates the time until the next message send attempt if the client hasn't sent an acknowledgment.
	 * The parameter `attempt` specifies the number of attempts already made.
	 */
	private calcTimeUntilNextAttempt(attempt: number): number {
		const avgWaitTime = Math.max(_.mean(this.timesUntilAcknowledgment) || 0, 20);
		return Math.min(2 ** attempt * avgWaitTime, 1000);
	}

	/** Pings the client to keep the session alive */
	private ping(): void {
		if (Date.now() - this.lastReceivedTime > UDP.sessionTimeout) {
			this.close();
		} else if (this.session && Date.now() - this.lastSendTime >= UDPSocket.AUTOPING) {
			this.sendAcknowledgment(0);
		}
	}
}