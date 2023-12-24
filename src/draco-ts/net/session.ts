import assert from "assert/strict";
import {Buffer} from "buffer";
import {randomBytes} from "crypto";
import {setTimeout} from "timers/promises";
import {promisify} from "util";
import Timeout from "../game-loop/timeout.js";
import {AuthorizableEntity} from "../orm/authorizable-entity.js";
import Message from "./message.js";
import Protobuf from "./protobuf.js";
import Service from "./service.js";
import UDPSocket from "./udp-socket.js";
import UDP from "./udp.js";
import WS, {WebSocket} from "./ws.js";

export default class Session {
	public static readonly TOKEN_SIZE = 48;
	public static waitForReconnection: number;
	public readonly token: Buffer;
	private static readonly sessionByToken = new Map<string, Session>;
	private readonly messageQueue: Buffer[] = [];
	private readonly serviceLastRunTime = new Map<typeof Service, number>();
	private readonly serviceAbortControllers = new Map<typeof Service, AbortController>();
	private entity?: AuthorizableEntity;
	private webSocket?: WebSocket;
	private udpSocket?: UDPSocket;
	private cleanTimeout?: Timeout;
	private closed = false;

	public static async create(): Promise<Session> {
		const token = await promisify(randomBytes)(Session.TOKEN_SIZE);
		return new Session(token);
	}

	public static getByToken(token: Buffer): Session | undefined {
		return Session.sessionByToken.get(token.toString("base64"));
	}

	protected constructor(token: Buffer) {
		this.token = token;
		const tokenAsString = token.toString("base64");
		assert(!Session.sessionByToken.has(tokenAsString));
		Session.sessionByToken.set(tokenAsString, this);
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
		assert(!entity._session || entity._session.closed, "The given entity is already authorized.");
		this.entity = entity;
		this.entity._session = this;
	}

	public reauthorize(entity: AuthorizableEntity): void {
		assert(!this.closed);
		entity._session?.close();
		this.authorize(entity);
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

	public async receive(message: Buffer, correctOrder?: boolean): Promise<void> {
		assert(!this.closed);
		const service = Protobuf.decode(message);
		if (service) {
			await service._exec(this, correctOrder);
		}
	}

	public close(): void {
		assert(!this.closed);
		this.logOut();
		this.udpSocket?.close();
		this.webSocket?.end();
		Session.sessionByToken.delete(this.token.toString("base64"));
		this.closed = true;
	}


	/**
	 * Limits the given service for user `user`: not more often than every `frequency` ms.
	 * If the user sends a request too early, this request will be delayed (but not more than one request).
	 * Should be used together with {@link updateLastTime}
	 */
	public async softLimit(ServiceClass: typeof Service, frequency: number): Promise<void> {
		const abortController = this.serviceAbortControllers.get(ServiceClass);
		if (abortController) {
			abortController.abort();
			this.serviceAbortControllers.delete(ServiceClass);
		}

		const shouldWait = this.getShouldWait(ServiceClass, frequency);
		if (shouldWait > 0) {
			const abort = new AbortController();
			this.serviceAbortControllers.set(ServiceClass, abort);
			await setTimeout(shouldWait, undefined, {ref: false, signal: abort.signal});
			this.serviceAbortControllers.delete(ServiceClass);
		}
	}

	/** Updates the last run time of the given service for this session */
	public updateLastTime(ServiceClass: typeof Service): void {
		this.serviceLastRunTime.set(ServiceClass, Date.now());
	}

	/** Returns how long the user should wait before he can execute a ServiceClass again */
	public getShouldWait(ServiceClass: typeof Service, frequency: number): number {
		const lastRunTime = this.serviceLastRunTime.get(ServiceClass) || 0;
		const passed = Date.now() - lastRunTime;
		return frequency - passed;
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