import assert from "assert/strict";
import {Buffer} from "buffer";
import {randomBytes} from "crypto";
import {promisify} from "util";
import Entity from "../orm/entity.js";
import {Constructor} from "../typings.js";
import Protobuf from "./protobuf.js";
import {WebSocket} from "./ws.js";

export default class Session {
	private static allowedEntities: Constructor<Entity>[] = [];
	private static sessionByToken = new Map<string, Session>;
	private webSocket?: WebSocket;
	private readonly token: string;
	private readonly messageQueue: Buffer[] = [];
	private entity?: Entity;
	private noSocketsSince = 0;

	public static async create(): Promise<Session> {
		const token = await Session.generateToken();
		return new Session(token);
	}

	public static getByToken(token: string): Session | undefined {
		return Session.sessionByToken.get(token);
	}

	public static setAllowedEntities(allowedEntities: Constructor<Entity>[]): void {
		Session.allowedEntities = allowedEntities;
	}

	protected constructor(token: string) {
		this.token = token;
		Session.sessionByToken.set(token, this);
	}

	public setWebSocket(webSocket: WebSocket): void {
		this.webSocket = webSocket;
		this.flush();
	}

	public getEntity(): Entity | undefined {
		return this.entity;
	}

	public setEntity(entity: Entity): void {
		assert(Session.allowedEntities.some(allowedEntity => entity instanceof allowedEntity));
		this.entity = entity;
	}

	public removeWebSocket(): void {
		delete this.webSocket;
		this.noSocketsSince = 0;
	}

	public send(message: Buffer): void {
		if (message.length < 1) {
			return;
		}
		this.messageQueue.push(message);
		this.flush();
	}

	public async receive(message: Buffer): Promise<void> {
		const service = Protobuf.decode(message);
		if (service) {
			await service._exec(this);
		}
	}

	public close(): void {
		Session.sessionByToken.delete(this.token);
	}

	private static async generateToken(): Promise<string> {
		return (await promisify(randomBytes)(48)).toString("hex");
	}

	private flush(): void {
		if (!this.webSocket) {
			return;
		}

		for (const message of this.messageQueue) {
			this.webSocket.send(message);
		}
		this.messageQueue.length = 0;
	}
}