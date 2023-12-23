import assert from "assert/strict";
import {Buffer} from "buffer";
import {randomBytes} from "crypto";
import {promisify} from "util";
import Timeout from "../game-loop/timeout.js";
import {AuthorizableEntity} from "../orm/authorizable-entity.js";
import Message from "./message.js";
import Protobuf from "./protobuf.js";
import UDPSocket from "./udp-socket.js";
import UDP from "./udp.js";
import WS, {WebSocket} from "./ws.js";

export default class Session {
	public static readonly TOKEN_SIZE = 48;
	public static waitForReconnection: number;
	public readonly token: Buffer;
	public readonly tokenAsString: string;
	private static sessionByToken = new Map<string, Session>;
	private readonly messageQueue: Buffer[] = [];
	private entity?: AuthorizableEntity;
	private webSocket?: WebSocket;
	private udpSocket?: UDPSocket;
	private cleanTimeout?: Timeout;
	private closed = false;

	public static async create(): Promise<Session> {
		const token = await Session.generateToken();
		return new Session(token);
	}

	public static getByToken(token: Buffer): Session | undefined {
		return Session.sessionByToken.get(token.toString("base64"));
	}

	protected constructor(token: Buffer) {
		this.token = token;
		this.tokenAsString = token.toString("base64");
		assert(!Session.sessionByToken.has(this.tokenAsString));
		Session.sessionByToken.set(this.tokenAsString, this);
	}

	public isConnected(): boolean {
		return this.webSocket !== undefined || this.udpSocket !== undefined;
	}

	public setWebSocket(webSocket: WebSocket): void {
		assert(!this.closed);
		this.webSocket = webSocket;
		webSocket.getUserData().session = this;
		this.connected();
	}

	public removeWebSocket(): void {
		assert(!this.closed);
		delete this.webSocket?.getUserData()?.session;
		delete this.webSocket;
		this.disconnected();
	}

	public setUdpSocket(udpSocket: UDPSocket): void {
		assert(!this.closed);
		this.udpSocket = udpSocket;
		udpSocket.session = this;
		this.connected();
	}

	public removeUdpSocket(): void {
		assert(!this.closed);
		delete this.udpSocket?.session;
		delete this.udpSocket;
		this.disconnected();
	}

	public getAuthorizedEntity(): AuthorizableEntity | undefined {
		assert(!this.closed);
		return this.entity;
	}

	public authorize(entity: AuthorizableEntity): void {
		assert(!this.closed);
		this.entity = entity;
		this.entity._session = this;
	}

	public logOut(): void {
		assert(!this.closed);
		delete this.entity?._session;
		delete this.entity;
	}

	public send(message: Message): void {
		assert(!this.closed);
		const buffer = Protobuf.encode(message);
		if (buffer.length < 1) {
			return;
		}
		this.messageQueue.push(buffer);
		this.flush();
	}

	public async receive(message: Buffer): Promise<void> {
		assert(!this.closed);
		const service = Protobuf.decode(message);
		if (service) {
			await service._exec(this);
		}
	}

	public close(): void {
		assert(!this.closed);
		this.logOut();
		this.udpSocket?.close();
		this.webSocket?.end();
		Session.sessionByToken.delete(this.tokenAsString);
		this.closed = true;
	}

	private static async generateToken(): Promise<Buffer> {
		return await promisify(randomBytes)(Session.TOKEN_SIZE);
	}

	private connected(): void {
		this.cleanTimeout?.stop();
		delete this.cleanTimeout;
		this.flush();
	}

	private disconnected(): void {
		if (!this.isConnected()) {
			this.cleanTimeout = Timeout.create(this.close.bind(this), Session.waitForReconnection);
		}
	}

	private flush(): void {
		assert(!this.closed);
		if (!this.isConnected()) {
			return;
		}

		const singlePacketSize = UDP.MAX_SAFE_PACKET_SIZE - UDPSocket.SENT_HEADER_SIZE;
		const udpMaxOptimalSize = UDP.maxOptimalPacketCount * singlePacketSize - 1;
		for (const message of this.messageQueue) {
			if (!this.webSocket || (this.udpSocket && message.length <= udpMaxOptimalSize)) {
				assert(this.udpSocket);
				this.udpSocket.send(message);
			} else {
				WS.send(this.webSocket, message);
			}
		}
		this.messageQueue.length = 0;
	}
}