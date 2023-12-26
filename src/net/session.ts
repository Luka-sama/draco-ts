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

/**
 * The session class. It unites the sockets from different protocols (web sockets, UDP),
 * queues the messages in case of a short disconnect,
 * authorizes the user (by binding an {@link AuthorizableEntity} to the session),
 * helps to manage the rate limiting.
 */
export default class Session {
	/** How long the server should wait for a disconnected user (and queue messages) before closing the session */
	public static waitForReconnection: number;
	/** Unique token. It is used to reconnect to the same session and to connect using UDP */
	public readonly token: Buffer;
	private static readonly TOKEN_SIZE = 48;
	private static readonly sessionByToken = new Map<string, Session>;
	/** If the user disconnects, the messages are queued in this array to send them when the user reconnects */
	private readonly messageQueue: Buffer[] = [];
	/** Stores the time of the last service run (for rate limiting) */
	private readonly serviceLastRunTime = new Map<typeof Service, number>;
	/** Abort controllers for services delayed due to rate limiting */
	private readonly serviceAbortControllers = new Map<typeof Service, AbortController>;
	/** List of the services that are currently running and therefore shouldn't be started again */
	private readonly lockedServices = new Set<typeof Service>;
	private entity?: AuthorizableEntity;
	private webSocket?: WebSocket;
	private udpSocket?: UDPSocket;
	/** A timeout to close the session if the user doesn't reconnect */
	private cleanTimeout?: Timeout;
	private closed = false;

	/** Creates a new session */
	public static async create(): Promise<Session> {
		const token = await promisify(randomBytes)(Session.TOKEN_SIZE);
		return new Session(token);
	}

	/** Finds a session by its token */
	public static getByToken(token: Buffer): Session | undefined {
		return Session.sessionByToken.get(token.toString("base64"));
	}

	/** Returns whether the user is connected (via web sockets or via UDP) */
	public isConnected(): boolean {
		return this.webSocket !== undefined || this.udpSocket !== undefined;
	}

	/** Binds the given web socket to the session */
	public bindWebSocket(webSocket: WebSocket): void {
		assert(!this.closed);
		this.webSocket = webSocket;
		webSocket.getUserData().session = this;
		this.connected();
	}

	/** Unbinds the web socket from the session */
	public unbindWebSocket(): void {
		assert(!this.closed);
		delete this.webSocket?.getUserData()?.session;
		delete this.webSocket;
		this.disconnected();
	}

	/** Binds the given UDP socket to the session */
	public bindUdpSocket(udpSocket: UDPSocket): void {
		assert(!this.closed);
		this.udpSocket = udpSocket;
		udpSocket.session = this;
		this.connected();
	}

	/** Unbinds the UDP socket from the session */
	public unbindUdpSocket(): void {
		assert(!this.closed);
		delete this.udpSocket?.session;
		delete this.udpSocket;
		this.disconnected();
	}

	/** Returns the entity that was authorized for this session */
	public getAuthorizedEntity(): AuthorizableEntity | undefined {
		assert(!this.closed);
		return this.entity;
	}

	/** Returns whether an entity was authorized for this session */
	public isAuthorized(): boolean {
		return this.entity != undefined;
	}

	/**
	 * Authorizes the given entity (binds it to the session).
	 * Make sure that the user is not already authorized (check that `entity.session` is undefined)
	 * or use {@link Session.reauthorize}.
	 */
	public authorize(entity: AuthorizableEntity): void {
		assert(!this.closed);
		assert(!entity.session, "The given entity is already authorized.");
		this.entity = entity;
		this.entity.session = this;
	}

	/**
	 * Authorizes the given entity (binds it to the session).
	 * If the user was already authorized, it closes the previous session
	 * (and transfers the necessary data from the old session to the new one).
	 */
	public reauthorize(entity: AuthorizableEntity): void {
		assert(!this.closed);
		if (entity.session) {
			for (const [ServiceClass, lastRunTime] of entity.session.serviceLastRunTime) {
				if (lastRunTime > (this.serviceLastRunTime.get(ServiceClass) || 0)) {
					this.serviceLastRunTime.set(ServiceClass, lastRunTime);
				}
			}
			entity.session.close();
		}
		this.authorize(entity);
	}

	/** Unbinds the authorized entity from the session */
	public logOut(): void {
		assert(!this.closed);
		delete this.entity?.session;
		delete this.entity;
	}

	/** Sends the message. If the user is disconnected, the message will be queued */
	public send(message: Message): void {
		assert(!this.closed);
		const buffer = Protobuf.encode(message);
		if (buffer.length < 1) {
			return;
		}
		this.messageQueue.push(buffer);
		this.flush();
	}

	/**
	 * Receives a message from the client. Decodes a protobuf message and invokes the corresponding service.
	 * See {@link ServiceOptions.correctOrder} and {@link Service._exec}
	 * for an explanation of the correct order.
	 */
	public async receive(message: Buffer, correctOrder?: boolean): Promise<void> {
		assert(!this.closed);
		const service = Protobuf.decode(message);
		if (service) {
			await service._exec(this, correctOrder);
		}
	}

	/** Closes the session */
	public close(): void {
		assert(!this.closed);
		this.logOut();
		this.udpSocket?.close();
		this.webSocket?.end();
		Session.sessionByToken.delete(this.token.toString("base64"));
		this.serviceAbortControllers.forEach(abortController => abortController.abort());
		this.serviceAbortControllers.clear();
		this.messageQueue.length = 0;
		this.closed = true;
	}

	/**
	 * Limits the given service for this session: not more often than every `frequency` ms.
	 * If the user sends a request too early, this request will be delayed
	 * (see {@link ServiceOptions.limit} for details).
	 * Should be used together with {@link Session.updateLastTime}.
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

	/** Returns how long the user should wait before he can execute the given service again */
	public getShouldWait(ServiceClass: typeof Service, frequency: number): number {
		const lastRunTime = this.serviceLastRunTime.get(ServiceClass) || 0;
		const passed = Date.now() - lastRunTime;
		return frequency - passed;
	}

	/**
	 * Locks a service to prevent simultaneously running of the same service.
	 * Returns `false` if the service is already locked
	 */
	public lockService(ServiceClass: typeof Service): boolean {
		if (this.lockedServices.has(ServiceClass)) {
			return false;
		}
		this.lockedServices.add(ServiceClass);
		return true;
	}

	/** Unlocks the given service */
	public unlockService(ServiceClass: typeof Service): void {
		this.lockedServices.delete(ServiceClass);
	}

	/** Creates a session with the given token */
	private constructor(token: Buffer) {
		this.token = token;
		const tokenAsString = token.toString("base64");
		assert(!Session.sessionByToken.has(tokenAsString));
		Session.sessionByToken.set(tokenAsString, this);
	}

	/**
	 * This method should be called when the user (re)connects to the session.
	 * It stops the session close timeout and sends all queued messages to the client.
	 */
	private connected(): void {
		this.cleanTimeout?.stop();
		delete this.cleanTimeout;
		this.flush();
	}

	/**
	 * This method should be called when the user disconnects.
	 * It sets a timeout to close the session if the user doesn't reconnect.
	 */
	private disconnected(): void {
		if (!this.isConnected()) {
			this.cleanTimeout = Timeout.create(this.close.bind(this), Session.waitForReconnection);
		}
	}

	/** Sends all queued messages if the user is connected */
	private flush(): void {
		assert(!this.closed);
		if (!this.isConnected()) {
			return;
		}

		const udpMaxOptimalSize = UDPSocket.calcMessageSize(UDP.maxOptimalPacketCount);
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