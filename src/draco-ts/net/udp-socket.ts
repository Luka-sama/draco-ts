import assert from "assert/strict";
import {Buffer} from "buffer";
import _ from "lodash";
import MapUtil from "../collection-utils/map-util.js";
import Task from "../game-loop/task.js";
import Timeout from "../game-loop/timeout.js";
import Session from "./session.js";
import UDP from "./udp.js";

interface ReceivedMessage {
	messageId: number;
	partNum: number;
	partCount?: number;
	tokenPrefix: Buffer;
	content: Buffer;
}

export default class UDPSocket {
	public static readonly SENT_HEADER_SIZE = 2;
	public session?: Session;
	private static readonly TOKEN_PREFIX_SIZE = 2;
	private static readonly RECEIVED_HEADER_SIZE = 2 + UDPSocket.TOKEN_PREFIX_SIZE;
	private static readonly MAX_MESSAGE_ID = 255;
	private static readonly HISTORY_LENGTH = 32;
	private static readonly AUTOPING = Math.round(UDP.sessionTimeout / UDP.attemptCount);
	private closed = false;
	private pingTask: Task;
	private lastMessageId = 0;
	private lastSendTime = Date.now();
	private lastReceivedTime = Date.now();
	private sendTime = new Map<number, number>;
	private receivedMessages: number[] = [];
	private timesUntilAcknowledge: number[] = [];
	private bigMessages = new Map<number, Buffer[]>;
	private receivedBytes = 0;
	private receivedSince = Date.now();
	private queuedForCorrectOrder = new Map<number, Buffer>;
	private nextToReceive = 1;
	private waitingForNextSince = Date.now();

	public constructor(
		public readonly address: string,
		public readonly port: number,
	) {
		this.pingTask = Task.create(this.ping.bind(this), {frequency: UDPSocket.AUTOPING});
	}

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

	private parseReceivedMessage(message: Buffer): ReceivedMessage {
		const messageId = message.readUIntBE(0, 1);
		const partNum = message.readUIntBE(1, 1);
		const offset = (partNum == 1 ? 1 : 0);
		const partCount = (partNum == 1 ? message.readUIntBE(2, 1) : undefined);
		const tokenPrefix = message.subarray(2 + offset, 2 + offset + UDPSocket.TOKEN_PREFIX_SIZE);
		const content = message.subarray(UDPSocket.RECEIVED_HEADER_SIZE + offset);
		return {messageId, partNum, partCount, tokenPrefix, content};
	}

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

		// session authentication or ping
		const messageId = message.readUIntBE(0, 1);
		if (messageId == 0) {
			const token = message.subarray(1);
			if (token.length > 0) { // if not ping
				this.establishSession(token);
			}
			return;
		}

		// parsing
		if (message.length < UDPSocket.RECEIVED_HEADER_SIZE) {
			return UDP.logger.debug(`The received message is too short (length ${message.length}).`);
		}
		const received = this.parseReceivedMessage(message);

		// check token prefix
		const rightTokenPrefix = this.session?.token.subarray(0, UDPSocket.TOKEN_PREFIX_SIZE);
		if (!this.session || !rightTokenPrefix?.equals(received.tokenPrefix)) {
			this.sendError();
			return UDP.logger.debug(`No session or wrong token prefix for message id ${messageId}.`);
		}

		// server got an acknowledgment
		const sendTime = this.sendTime.get(messageId);
		if (message.length <= UDPSocket.RECEIVED_HEADER_SIZE) {
			if (sendTime !== undefined) {
				UDPSocket.addEntryToHistory(this.timesUntilAcknowledge, Date.now() - sendTime);
				this.sendTime.delete(messageId);
			}
			return;
		}

		// server got a message
		this.sendAcknowledgement(messageId);
		if (this.receivedMessages.includes(messageId)) {
			return; // duplicate
		}
		UDPSocket.addEntryToHistory(this.receivedMessages, messageId);
		await this.processReceivedMessage(received);
	}

	public close(shouldNotifyClient = true): void {
		assert(!this.closed);
		this.session?.removeUdpSocket();
		UDP.removeSocket(this);
		this.pingTask.stop();
		if (shouldNotifyClient) {
			this.sendError();
		}
		this.closed = true;
	}

	private static getNextId(messageId: number): number {
		return (messageId >= UDPSocket.MAX_MESSAGE_ID ? 1 : messageId + 1);
	}

	private static addEntryToHistory(array: number[], newEntry: number): void {
		array.push(newEntry);
		if (array.length > UDPSocket.HISTORY_LENGTH) {
			array.shift();
		}
	}

	private async processReceivedMessage({messageId, partNum, partCount, content}: ReceivedMessage): Promise<void> {
		assert(this.session);
		if (partNum > 0) {
			const firstId = messageId - partNum + 1 + (messageId < partNum ? UDPSocket.MAX_MESSAGE_ID : 0);
			const parts = MapUtil.getArray(this.bigMessages, firstId);
			if (partCount) {
				parts.length = partCount;
			}
			parts[partNum - 1] = content;

			if (Object.keys(parts).length == parts.length) { // no empty slots
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
			while (!this.queuedForCorrectOrder.has(this.nextToReceive)) {
				this.nextToReceive = UDPSocket.getNextId(this.nextToReceive);
			}
		}
		let nextMessage;
		while (nextMessage = this.queuedForCorrectOrder.get(this.nextToReceive)) {
			this.queuedForCorrectOrder.delete(this.nextToReceive);
			if (nextMessage.length > 0) {
				await this.session.receive(nextMessage, true);
			}
			this.nextToReceive = UDPSocket.getNextId(this.nextToReceive);
			this.waitingForNextSince = Date.now();
		}
	}

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

	private calcTimeUntilNextAttempt(attempt: number): number {
		const avgWaitTime = Math.max(_.mean(this.timesUntilAcknowledge) || 0, 20);
		return Math.min(2 ** attempt * avgWaitTime, 1000);
	}

	private ping(): void {
		if (Date.now() - this.lastReceivedTime > UDP.sessionTimeout) {
			this.close();
		} else if (this.session && Date.now() - this.lastSendTime >= UDPSocket.AUTOPING) {
			this.sendAcknowledgement(0);
		}
	}

	private establishSession(token: Buffer): void {
		const session = Session.getByToken(token);
		if (!session) {
			this.sendError();
			return UDP.logger.debug(`Wrong session token ${token}.`);
		}
		session.setUdpSocket(this);
		this.sendAcknowledgement(0);
		this.nextToReceive = 1;
	}

	private sendAcknowledgement(messageId: number): void {
		this.lastSendTime = Date.now();
		UDP.send(this.address, this.port, Buffer.from([messageId]));
	}

	private sendError(): void {
		this.lastSendTime = Date.now();
		UDP.send(this.address, this.port, Buffer.from([0, 0]));
	}
}