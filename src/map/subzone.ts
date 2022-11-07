import {AnyEntity} from "@mikro-orm/core";
import User from "../auth/user.entity";
import CachedObject from "../cache/cached-object";
import {EM} from "../core/orm";
import {Emitter, UserData} from "../core/ws.typings";
import {Vec2, Vector2} from "../math/vector.embeddable";
import Location from "./location.entity";
import ZoneEntities from "./zone-entities";

export default class Subzone extends CachedObject implements Emitter {
	static readonly SIZE = Vec2(16, 16);
	private loaded = false;
	private readonly location: Location;
	private readonly mapPosition: Vector2;
	private entities: ZoneEntities = new ZoneEntities();
	private get start(): Vector2 {
		return this.mapPosition.mul(Subzone.SIZE);
	}
	private get end(): Vector2 {
		return this.start.add(Subzone.SIZE);
	}

	constructor(location: Location, position: Vector2) {
		super(location, position);
		this.location = location;
		this.mapPosition = position;
		return this.getInstance();
	}

	async load(): Promise<void> {
		if (this.loaded) {
			return;
		}
		const where = {location: this.location, position: {
			x: {$gte: this.start.x, $lt: this.end.x},
			y: {$gte: this.start.y, $lt: this.end.y}
		}};
		this.entities.User = new Set( await EM.find(User, where) );
		this.loaded = true;
	}

	getName(): string {
		return Subzone.getNameFor(this.location, this.mapPosition);
	}

	emit(event: string, data: UserData = {}): void {
		for (const user of this.entities.User) {
			user.emit(event, data);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}

	getEntities(): ZoneEntities {
		this.checkIfLoaded();
		return this.entities;
	}

	leave(entity: AnyEntity): void {
		this.entities.delete(entity);
	}

	enter(entity: AnyEntity): void {
		this.entities.enter(entity);
	}

	static getNameFor(location: Location, position: Vector2): string {
		return `subzone/location${location.id}/${position.x}x${position.y}`;
	}

	static getMapPosition(userPosition: Vector2): Vector2 {
		return userPosition.intdiv(Subzone.SIZE);
	}

	private checkIfLoaded(): void {
		if (!this.loaded) {
			throw new Error("Subzone not loaded");
		}
	}
}