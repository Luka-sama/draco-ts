import {AnyEntity} from "@mikro-orm/core";
import User from "../auth/user.entity";
import CachedObject from "../cache/cached-object";
import {EM} from "../core/orm";
import {Emitter, UserData} from "../core/ws.typings";
import {Vec2, Vector2} from "../math/vector.embeddable";
import Location from "./location.entity";
import ZoneEntities from "./zone-entities";

/**
 * Subzone class
 *
 * See {@link Zone} for details.
 */
export default class Subzone extends CachedObject implements Emitter {
	static readonly SIZE = Vec2(16, 16);
	private loaded = false;
	private readonly location: Location;
	private readonly zonePosition: Vector2;
	private entities: ZoneEntities = new ZoneEntities();
	/** Returns position of the start tile (included in this zone) */
	private get start(): Vector2 {
		return this.zonePosition.mul(Subzone.SIZE);
	}
	/** Returns position of the last tile plus (1, 1), i.e. not included in this zone */
	private get end(): Vector2 {
		return this.start.add(Subzone.SIZE);
	}

	constructor(location: Location, position: Vector2) {
		super(location, position);
		this.location = location;
		this.zonePosition = position;
		return this.getInstance();
	}

	/** Loads all entities that are in this subzone */
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

	/** Returns the name of this subzone */
	getName(): string {
		return Subzone.getNameFor(this.location, this.zonePosition);
	}

	emit(event: string, data: UserData = {}): void {
		for (const user of this.entities.User) {
			user.emit(event, data);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}

	/** Returns all entities of this subzone */
	getEntities(): ZoneEntities {
		this.checkIfLoaded();
		return this.entities;
	}

	/** Removes en entity from this subzone */
	leave(entity: AnyEntity): void {
		this.entities.delete(entity);
	}

	/** Adds en entity to this subzone */
	enter(entity: AnyEntity): void {
		this.entities.enter(entity);
	}

	/** Returns `true` if the given position is inside of this subzone */
	isInside(position: Vector2): boolean {
		this.checkIfLoaded();
		return Subzone.getZonePosition(position).equals(this.zonePosition);
	}

	/** Returns the name of a subzone with the given location and zone position */
	static getNameFor(location: Location, zonePosition: Vector2): string {
		return `subzone/location${location.id}/${zonePosition.x}x${zonePosition.y}`;
	}

	/** Converts a tile position (e.g. the position of a user, a item etc) to a zone position */
	static getZonePosition(position: Vector2): Vector2 {
		return position.intdiv(Subzone.SIZE);
	}

	/** Returns a loaded subzone by a given location and zone position */
	static async get(location: Location, zonePosition: Vector2): Promise<Subzone> {
		const subzone = new Subzone(location, zonePosition);
		await subzone.load();
		return subzone;
	}

	/** Throws an exception if this subzone is not loaded */
	private checkIfLoaded(): void {
		if (!this.loaded) {
			throw new Error("Subzone not loaded");
		}
	}
}