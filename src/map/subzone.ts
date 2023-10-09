import assert from "assert/strict";
import fs from "fs";
import _ from "lodash";
import User from "../auth/user.entity.js";
import {WeakCachedObject} from "../draco-ts/cache/cached-object.js";
import DB from "../draco-ts/orm/db.js";
import Entity from "../draco-ts/orm/entity.js";
import ORM from "../draco-ts/orm/orm.js";
import {EntityClass, IEntity} from "../draco-ts/orm/orm.typings.js";
import {UserContainer} from "../draco-ts/sync/sync.typings.js";
import {JSONObject} from "../draco-ts/util/validation.js";
import {Vec2, Vector2} from "../draco-ts/util/vector.js";
import {Receiver} from "../draco-ts/ws.js";
import Item from "../item/item.entity.js";
import Location from "./location.entity.js";
import Tile from "./tile.entity.js";
import ZoneEntities, {EntityInfo} from "./zone-entities.js";

/**
 * Subzone class
 *
 * See {@link Zone} for details.
 */
export default class Subzone extends WeakCachedObject implements Receiver, UserContainer {
	private static readonly SIZE = Vec2(16, 32);
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

	static async loadAll(zones: Subzone[] | Set<Subzone>): Promise<void> {
		await Promise.all(Array.from(zones).map(zone => zone.load()));
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

	/** Returns if this subzone is loaded */
	isLoaded(): boolean {
		return this.loaded;
	}

	/** Returns the location of this subzone */
	getLocation(): Location {
		return this.location;
	}

	/** Returns the zone position of this subzone */
	getZonePosition(): Vector2 {
		return this.zonePosition;
	}

	emit(event: string, data: JSONObject = {}): void {
		for (const user of this.getUsers()) {
			user.emit(event, data);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}

	/** Returns all entities from this subzone */
	getEntities(): ZoneEntities {
		assert(this.loaded);
		return this.entities;
	}

	/** Returns all entities from this subzone (probably not loaded) */
	getEntitiesFromMemory(): ZoneEntities {
		return this.entities;
	}

	/** Returns all users from this subzone */
	getUsers(): Set<User> {
		assert(this.loaded);
		return this.entities.get(User);
	}

	/** Returns all already loaded users from this subzone */
	getUsersFromMemory(): Set<User> {
		return this.getEntitiesFromMemory().getFromMemory(User);
	}

	/** Removes en entity from this subzone */
	leave(entity: Entity): void {
		assert(this.loaded);
		this.entities.delete(entity);
		fs.appendFileSync("D:/test.txt", `[${Date.now()}] ${entity.constructor.name} ${entity.id} (${entity.position.x}, ${entity.position.y}) leaved ${this.zonePosition.x}x${this.zonePosition.y}\n`);
	}

	/** Adds en entity to this subzone */
	enter(entity: Entity): void {
		assert(this.loaded);
		this.entities.enter(entity);
		fs.appendFileSync("D:/test.txt", `[${Date.now()}] ${entity.constructor.name} ${entity.id} (${entity.position.x}, ${entity.position.y}) entered ${this.zonePosition.x}x${this.zonePosition.y}\n`);
	}

	/** Checks if somebody in this subzone is online */
	isSomebodyOnline(): boolean {
		return (this.loaded ? [...this.getUsers()].some(user => user.connected) : false);
	}

	/** Returns `true` if the given position is inside of this subzone */
	isInside(position: Vector2): boolean {
		return Subzone.getZonePosition(position).equals(this.zonePosition);
	}

	/** Returns `true` if some tile is at the given position */
	hasTile(position: Vector2): boolean {
		assert(this.loaded);
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
		assert(this.loaded);
		assert(this.isInside(position));
		for (const model of [User, Item] as EntityClass[]) {
			for (const entity of this.getFrom(model, position)) {
				if (model != Item || (!entity.type.walkable && !entity.holder)) {
					return false;
				}
			}
		}
		return true;
	}

	/** Returns all entities of the given model at the given position */
	getFrom<T extends IEntity>(model: T, position: Vector2): Set<InstanceType<T>> {
		assert(this.loaded);
		assert(this.isInside(position));
		const result = new Set<T>;

		for (const entity of this.entities.get(model) as any) {
			const entityPositions = (entity.getPositions ? entity.getPositions(entity.position, true) : [entity.position]);
			if (position.isElementOf(entityPositions)) {
				result.add(entity);
			}
		}

		return result as any;
	}

	/** Returns a random position inside of this subzone */
	getRandomPositionInside(staggered = true): Vector2 {
		const position = Vec2(
			_.random(this.start.x, this.end.x - 1),
			_.random(this.start.y, this.end.y - 1),
		);
		if (staggered && position.y % 2 != 0) {
			return position.add(Vec2(0, (position.y == this.start.y ? 1 : -1)));
		}
		return position;
	}

	/** Returns a list of ids for objects that have a shape (such as items), i.e. occupy several tiles */
	private async getIdsOfShapedObjects(info: EntityInfo): Promise<number[]> {
		const query = `SELECT DISTINCT ${info.table}.id FROM ${info.table}
INNER JOIN ${info.partTable} ON ${info.partTable}.${info.partForeignKey || info.foreignKey}=${info.table}.${info.foreignKey} WHERE
${info.table}.location_id = $1 AND
${info.partTable}.x + ${info.table}.x >= $2 AND ${info.partTable}.x + ${info.table}.x < $3 AND
${info.partTable}.y + ${info.table}.y >= $4 AND ${info.partTable}.y + ${info.table}.y < $5`;
		const params = [this.location.id, this.start.x, this.end.x, this.start.y, this.end.y];
		return (await DB.query(query, params)).rows.map(el => el.id);
	}

	/** Loads all entities that are in this subzone */
	private async loadEntities(): Promise<void> {
		const entities = this.entities;

		for (const [entity, entityInfo] of ZoneEntities.getEntitiesInfo()) {
			if (entityInfo.table) {
				const entityIds = await this.getIdsOfShapedObjects(entityInfo);
				if (entityIds.length > 0) {
					entities.set(entity, await ORM.find(entity, `id IN (${entityIds.join(", ")}) ORDER BY id`));
				} else {
					entities.set(entity, []);
				}
			} else {
				entities.set(entity, await ORM.find(entity, `location_id=${this.location.id} and x >= ${this.start.x} and x < ${this.end.x} and y >= ${this.start.y} and y < ${this.end.y} ORDER BY id`) );
			}
		}
	}
}