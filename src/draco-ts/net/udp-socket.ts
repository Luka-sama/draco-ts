import assert from "assert/strict";
import {Buffer} from "buffer";
import _ from "lodash";
import MapUtil from "../collection-utils/map-util.js";
import Task from "../game-loop/task.js";
import Timeout from "../game-loop/timeout.js";
import Session from "./session.js";
import UDP from "./udp.js";

export default class UDPSocket {
	public session?: Session;
	public static readonly SENT_HEADER_SIZE = 2;
	private static readonly TOKEN_PREFIX_SIZE = 2;
	private static readonly RECEIVED_HEADER_SIZE = 2 + UDPSocket.TOKEN_PREFIX_SIZE;
	private static readonly MAX_MESSAGE_ID = 255;
	private static readonly HISTORY_LENGTH = 64;
	private static readonly AUTOPING = Math.round(UDP.sessionTimeout / UDP.attemptCount);
	private pingTask: Task;
	private lastMessageId = 0;
	private lastSendTime = Date.now();
	private lastReceivedTime = Date.now();
	private sendTime = new Map<number, number>;
	private acknowledgedMessages: number[] = [];
	private receivedMessages: number[] = [];
	private timesUntilAcknowledge: number[] = [];
	private incompleteMessages = new Map<number, Buffer[]>;
	private closed = false;

	public constructor(
		public readonly address: string,
		public readonly port: number,
	) {
		this.pingTask = Task.create(this.ping.bind(this), {frequency: UDPSocket.AUTOPING});
	}

	public send(fullMessage: Buffer): void {
		assert(!this.closed);

		const maxLength = (UDP.MAX_SAFE_PACKET_SIZE - UDPSocket.SENT_HEADER_SIZE) * UDPSocket.MAX_MESSAGE_ID - 1;
		assert(fullMessage.length <= maxLength);

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

	private sendPart(partContent: Buffer, partNum: number, partCount: number): void {
		this.lastMessageId = (this.lastMessageId >= UDPSocket.MAX_MESSAGE_ID ? 1 : this.lastMessageId + 1);
		const messageId = this.lastMessageId;

		const header = [messageId, partNum];
		if (partNum == 1) {
			header.push(partCount);
		}
		const message = Buffer.concat([Buffer.from(header), partContent]);

		let attempt = 0;
		const sendCallback = () => {
			if (this.acknowledgedMessages.includes(messageId)) {
				return;
			}
			this.lastSendTime = Date.now();
			UDP.send(this.address, this.port, message, () => {
				attempt++;
				if (attempt < UDP.attemptCount) {
					Timeout.create(sendCallback, this.calcTimeUntilNextAttempt(attempt));
				} else if (Date.now() - this.lastReceivedTime > UDP.sessionTimeout) {
					this.close(false);
				}
			});
		};
		sendCallback();
		this.sendTime.set(messageId, Date.now());
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

	public async receive(message: Buffer): Promise<void> {
		assert(!this.closed);
		this.lastReceivedTime = Date.now();
		const messageId = message.readUIntBE(0, 1);
		if (messageId == 0) {
			const token = message.subarray(1);
			if (token.length > 0) {
				this.establishSession(token);
			}
			return;
		}

		const rightTokenPrefix = this.session?.token.subarray(0, UDPSocket.TOKEN_PREFIX_SIZE);
		const sentTokenPrefix = message.subarray(2, 2 + UDPSocket.TOKEN_PREFIX_SIZE);
		const isAcknowledgement = (message.length <= UDPSocket.RECEIVED_HEADER_SIZE);
		if (!this.session || !rightTokenPrefix?.equals(sentTokenPrefix)) {
			this.sendError();
		} else if (isAcknowledgement && !this.acknowledgedMessages.includes(messageId)) {
			this.addEntryToHistory(this.acknowledgedMessages, messageId);
			const sendTime = this.sendTime.get(messageId);
			if (sendTime) {
				this.addEntryToHistory(this.timesUntilAcknowledge, Date.now() - sendTime);
			}
		} else if (!isAcknowledgement) {
			this.sendAcknowledgement(messageId);
			if (!this.receivedMessages.includes(messageId)) {
				this.addEntryToHistory(this.receivedMessages, messageId);
				const partNum = message.readUIntBE(1, 1);
				const content = message.subarray(UDPSocket.RECEIVED_HEADER_SIZE + (partNum == 1 ? 1 : 0));
				if (partNum > 0) {
					const firstId = messageId - partNum + 1 + (messageId < partNum ? UDPSocket.MAX_MESSAGE_ID : 0);
					const parts = MapUtil.getArray(this.incompleteMessages, firstId);
					if (partNum == 1) {
						parts.length = message.readUIntBE(2, 1);
					}
					parts[partNum - 1] = content;

					if (Object.keys(parts).length == parts.length) { // no empty slots
						const fullMessage = Buffer.concat(parts);
						await this.session.receive(fullMessage);
						this.incompleteMessages.delete(firstId);
					}
				} else {
					await this.session.receive(content);
				}
			}
		}
	}

	private ping(): void {
		if (Date.now() - this.lastReceivedTime > UDP.sessionTimeout) {
			this.close();
		} else if (this.session && Date.now() - this.lastSendTime >= UDPSocket.AUTOPING) {
			this.sendAcknowledgement(0);
		}
	}

	private addEntryToHistory(array: number[], newEntry: number) {
		array.push(newEntry);
		if (array.length > UDPSocket.HISTORY_LENGTH) {
			array.shift();
		}
	}

	private calcTimeUntilNextAttempt(attempt: number): number {
		const avgWaitTime = _.mean(this.timesUntilAcknowledge);
		return _.clamp(2 ** attempt * avgWaitTime, 30, 1000);
	}

	private establishSession(token: Buffer): void {
		const session = Session.getByToken(token);
		if (!session) {
			this.sendError();
			return UDP.logger.debug(`Wrong session token ${token}.`);
		}
		session.setUdpSocket(this);
		this.sendAcknowledgement(0);
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