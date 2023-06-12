import {AnyEntity, EntityClass, QueryOrder} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity.js";
import {WeakCachedObject} from "../cache/cached-object.js";
import {EM} from "../core/orm.js";
import {UserContainer} from "../core/sync.typings.js";
import {Emitter, UserData} from "../core/ws.typings.js";
import Item from "../item/item.entity.js";
import LightsGroup from "../magic/lights-group.entity.js";
import {Vec2, Vector2} from "../util/vector.embeddable.js";
import Location from "./location.entity.js";
import Tile from "./tile.entity.js";
import ZoneEntities from "./zone-entities.js";

/**
 * Subzone class
 *
 * See {@link Zone} for details.
 */
export default class Subzone extends WeakCachedObject implements Emitter, UserContainer {
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

	constructor(location: Location, position: Vector2) {
		super(location, position);
		this.location = location;
		this.zonePosition = position;
		return this.getInstance();
	}

	/** Handles loading to execute {@link loadEntities} only once */
	async load(): Promise<void> {
		if (this.loaded) {
			return;
		}
		if (this.loading) {
			return new Promise<void>(resolve => this.waiting.push(resolve));
		}
		this.loading = true;
		await this.loadEntities();

		this.loaded = true;
		this.loading = false;
		process.nextTick(() => {
			this.waiting.forEach(waiting => waiting());
			this.waiting.length = 0;
		});
	}

	/** Returns the name of this subzone */
	getName(): string {
		return Subzone.getNameFor(this.location, this.zonePosition);
	}

	emit(event: string, data: UserData = {}): void {
		for (const user of this.getUsers()) {
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
		return this.entities.get(User);
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

	/** Returns `true` if some tile is at the given position */
	hasTile(position: Vector2): boolean {
		assert(this.isInside(position));
		for (const tile of this.entities.get(Tile)) {
			if (tile.position.equals(position)) {
				return true;
			}
		}
		return false;
	}

	/** Returns `true` if no user, (big) item etc. takes the tile at the given position */
	isTileFree(position: Vector2): boolean {
		assert(this.isInside(position));
		for (const model of [User, Item] as EntityClass<AnyEntity>[]) {
			for (const entity of this.getFrom(model, position)) {
				if (model != Item || (!entity.type.walkable && !entity.holder)) {
					return false;
				}
			}
		}
		return true;
	}

	getFrom<T extends AnyEntity>(model: EntityClass<T>, position: Vector2): Set<T> {
		assert(this.isInside(position));
		const result = new Set<T>;

		for (const entity of this.entities.get(model)) {
			const entityPositions = (entity.getPositions ? entity.getPositions(entity.position, true) : [entity.position]);
			if (position.isElementOf(entityPositions)) {
				result.add(entity);
			}
		}

		return result;
	}

	/** Returns a random position inside of this subzone */
	getRandomPositionInside(): Vector2 {
		return Vec2(
			_.random(this.start.x, this.end.x - 1),
			_.random(this.start.y, this.end.y - 1),
		);
	}

	/** Throws an exception if this subzone is not loaded */
	private checkIfLoaded(): void {
		assert(this.loaded, "Subzone not loaded");
	}

	/** Returns a list of ids for objects that have a shape (such as items), i.e. occupy several tiles */
	private async getIdsOfShapedObjects(table: string, partTable: string, foreignKey: string, partForeignKey = foreignKey): Promise<number[]> {
		const query = `SELECT DISTINCT ${table}.id FROM ${table}
INNER JOIN ${partTable} ON ${partTable}.${partForeignKey}=${table}.${foreignKey} WHERE
${table}.location_id = ? AND
${partTable}.x + ${table}.x >= ? AND ${partTable}.x + ${table}.x < ? AND
${partTable}.y + ${table}.y >= ? AND ${partTable}.y + ${table}.y < ?`;
		const params = [this.location.id, this.start.x, this.end.x, this.start.y, this.end.y];
		return (await EM.execute(query, params)).map(el => el.id);
	}

	/** Loads all entities that are in this subzone */
	private async loadEntities(): Promise<void> {
		const where = {location: this.location, position: {
			x: {$gte: this.start.x, $lt: this.end.x},
			y: {$gte: this.start.y, $lt: this.end.y}
		}};
		const orderBy = {id: QueryOrder.ASC};
		const entities = this.entities;

		const itemIds = await this.getIdsOfShapedObjects("item", "item_shape_part", "type_id");
		const lightsGroupIds = await this.getIdsOfShapedObjects("lights_group", "light", "id", "lights_group_id");

		entities.set(Tile, await EM.find(Tile, where, {orderBy, populate: true}) );
		entities.set(User, await EM.find(User, where, {orderBy, populate: true}) );
		entities.set(Item, await EM.find(Item, {id: itemIds}, {orderBy, populate: true}) );
		entities.set(LightsGroup, await EM.find(LightsGroup, {id: lightsGroupIds}, {orderBy, populate: true}) );
	}
}