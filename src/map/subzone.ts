import {AnyEntity, QueryOrder} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity.js";
import CachedObject from "../cache/cached-object.js";
import {EM} from "../core/orm.js";
import {UserContainer} from "../core/sync.typings.js";
import {Emitter, UserData} from "../core/ws.typings.js";
import {Vec2, Vector2} from "../math/vector.embeddable.js";
import Location from "./location.entity.js";
import Tile from "./tile.entity.js";
import ZoneEntities from "./zone-entities.js";

/**
 * Subzone class
 *
 * See {@link Zone} for details.
 */
export default class Subzone extends CachedObject implements Emitter, UserContainer {
	static readonly SIZE = Vec2(16, 32);
	private loaded = false;
	private loading = false;
	private waiting: (() => void)[] = [];
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
		if (this.loading) {
			return new Promise<void>(resolve => this.waiting.push(resolve));
		}
		this.loading = true;
		const where = {location: this.location, position: {
			x: {$gte: this.start.x, $lt: this.end.x},
			y: {$gte: this.start.y, $lt: this.end.y}
		}};
		const orderBy = {id: QueryOrder.ASC};
		this.entities.Tile = new Set( await EM.find(Tile, where, {orderBy, populate: ["tileset"]}) );
		this.entities.User = new Set( await EM.find(User, where, {orderBy}) );

		this.loaded = true;
		this.loading = false;
		process.nextTick(() => {
			for (const waiting of this.waiting) {
				waiting();
			}
			this.waiting.length = 0;
		});
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

	/** Returns all entities from this subzone */
	getEntities(): ZoneEntities {
		this.checkIfLoaded();
		return this.entities;
	}

	/** Returns all users from this subzone */
	getUsers(): Set<User> {
		this.checkIfLoaded();
		return this.entities.get("User") as Set<User>;
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

	/** Returns `true` if no user, (big) item etc. takes the tile at the given position */
	isTileFree(position: Vector2): boolean {
		assert(this.isInside(position));
		for (const model of ZoneEntities.getModels()) {
			if (model != "User") {
				continue;
			}

			for (const entity of this.entities.get(model)) {
				if (entity.position.equals(position)) {
					return false;
				}
			}
		}
		return true;
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