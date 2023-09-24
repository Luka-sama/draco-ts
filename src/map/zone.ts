import assert from "assert/strict";
import fs from "fs";
import User from "../auth/user.entity.js";
import Cache from "../draco-ts/cache/cache.js";
import CachedObject from "../draco-ts/cache/cached-object.js";
import Entity from "../draco-ts/orm/entity.js";
import {IEntity} from "../draco-ts/orm/orm.typings.js";
import SetUtil from "../draco-ts/util/set-util.js";
import {UserData} from "../draco-ts/util/validation.js";
import {Vec2, Vector2} from "../draco-ts/util/vector.js";
import {Receiver} from "../draco-ts/ws.js";
import Location from "./location.entity.js";
import Subzone from "./subzone.js";
import ZoneEntities from "./zone-entities.js";

/**
 * The map is divided into subzones of equal size.
 * A zone contains a central subzone and 8 adjacent subzones.
 * So the user will not notice lags if he is on the edge of his subzone - he has already info about adjacent subzones.
 *
 * It is important to distinguish:
 * - "Position" means a tile position (e.g. the position of a user, a item etc)
 * - "Zone position" means a zone position among other zones
 * Zone position depends on zone size, but for example, if the zone size is 16x16,
 * the tile with position 12x7 will be in the zone 0x0.
 */
export default class Zone extends CachedObject implements Receiver {
	/** X-coordinate of neighboring tiles */
	public static readonly NEIGHBORING_X = [0, -1, 1];
	/** Y-coordinate of neighboring tiles (for staggered maps) */
	public static readonly NEIGHBORING_Y = [0, -1, 1, -2, 2];
	private loaded = false;
	private readonly location: Location;
	private readonly zonePosition: Vector2;
	private subzones = new Set<Subzone>;
	private centralSubzone!: Subzone;

	/** Returns the name of a zone with the given location and zone position */
	static getNameFor(location: Location, zonePosition: Vector2): string {
		return `zone/location${location.id}/${zonePosition.x}x${zonePosition.y}`;
	}

	/** Converts a tile position (e.g. the position of a user, a item etc) to a zone position */
	static getZonePosition(position: Vector2): Vector2 {
		return Subzone.getZonePosition(position);
	}

	/** Returns a loaded zone by a given location and zone position */
	static async get(location: Location, zonePosition: Vector2): Promise<Zone> {
		const zone = new Zone(location, zonePosition);
		await zone.load();
		return zone;
	}

	/** Returns a loaded zone by a given location and position */
	static async getByPosition(location: Location, position: Vector2): Promise<Zone> {
		const zonePosition = Zone.getZonePosition(position);
		return await Zone.get(location, zonePosition);
	}

	/** Returns multiple loaded zones by a given location and multiple positions */
	static async getByPositions(location: Location, positions: Vector2[]): Promise<Set<Zone>> {
		const zones = new Set<Zone>();
		for (const position of positions) {
			const zone = await Zone.getByPosition(location, position);
			zones.add(zone);
		}
		return zones;
	}

	/** Returns a loaded zone by a given entity with location and position */
	static async getByEntity(entity: Entity): Promise<Zone> {
		return await Zone.getByPosition(entity.location, entity.position);
	}

	/** Returns a (probably) not loaded zone by a given location and position */
	static getByPositionFromMemory(location: Location, position: Vector2): Zone {
		const zonePosition = Zone.getZonePosition(position);
		return new Zone(location, zonePosition);
	}

	/** Returns multiple (probably) not loaded zones by a given location and multiple positions */
	static getByPositionsFromMemory(location: Location, positions: Vector2[]): Set<Zone> {
		const zones = new Set<Zone>;
		for (const position of positions) {
			const zone = Zone.getByPositionFromMemory(location, position);
			if (zone) {
				zones.add(zone);
			}
		}
		return zones;
	}

	/** Returns a (probably) not loaded zone by a given entity with location and position */
	static getByEntityFromMemory(entity: Entity): Zone {
		return Zone.getByPositionFromMemory(entity.location, entity.position);
	}

	/** Collects entities from all given subzones */
	static getEntitiesFromSubzones(subzones: Set<Subzone>): ZoneEntities {
		const zoneEntities = new ZoneEntities;
		subzones.forEach(subzone => zoneEntities.merge(subzone.getEntities()));
		return zoneEntities;
	}

	/** Collects entities from all given subzones */
	static getEntitiesFromSubzonesFromMemory(subzones: Set<Subzone>): ZoneEntities {
		const zoneEntities = new ZoneEntities;
		subzones.forEach(subzone => zoneEntities.merge(subzone.getEntitiesFromMemory()));
		return zoneEntities;
	}

	/** Returns a list of subzones that are in the given zones */
	static getSubzonesFrom(zones: Set<Zone>): Set<Subzone> {
		const subzones = new Set<Subzone>;
		zones.forEach(zone => SetUtil.merge(subzones, zone.subzones));
		return subzones;
	}

	/** Returns a list of subzones that are in `currZones`, but not in `oldZones` */
	static getNewSubzones(oldZones: Set<Zone>, currZones: Set<Zone>): Set<Subzone> {
		const currSubzones = Zone.getSubzonesFrom(currZones);
		const oldSubzones = Zone.getSubzonesFrom(oldZones);
		return SetUtil.difference(currSubzones, oldSubzones);
	}

	/** Returns a list of subzones that are in `oldZones`, but not in `currZones` */
	static getLeftSubzones(oldZones: Set<Zone>, currZones: Set<Zone>): Set<Subzone> {
		return Zone.getNewSubzones(currZones, oldZones);
	}

	/** Returns a list of subzones that are both in `oldZones` and in `currZones` */
	static getRemainingSubzones(oldZones: Set<Zone>, currZones: Set<Zone>): Set<Subzone> {
		const currSubzones = Zone.getSubzonesFrom(currZones);
		const oldSubzones = Zone.getSubzonesFrom(oldZones);
		return SetUtil.intersection(currSubzones, oldSubzones);
	}

	static async isTileFree(location: Location, position: Vector2): Promise<boolean> {
		const zone = await Zone.getByPosition(location, position);
		return zone.isTileFree(position);
	}

	static async areTilesFree(location: Location, positions: Vector2[]): Promise<boolean> {
		for (const position of positions) {
			const isTileFree = await Zone.isTileFree(location, position);
			if (!isTileFree) {
				return false;
			}
		}
		return true;
	}

	static async loadAll(zones: Zone[] | Set<Zone>): Promise<void> {
		await Promise.all(Array.from(zones).map(zone => zone.load()));
	}

	/** Updates last access time for all cache entries of subzones where somebody is online */
	public static stayInCacheIfSomebodyIsOnline(): void {
		const zones: Zone[] = Cache.getLeaves("zone");
		for (const zone of zones) {
			if (zone.isSomebodyOnline()) {
				Cache.get(zone.getName());
			}
		}
	}

	public static async getFrom<T extends IEntity>(model: T, location: Location, positions: Vector2 | Vector2[]): Promise<Set<InstanceType<T>>> {
		positions = (positions instanceof Array ? positions : [positions]);
		const result = new Set<T>;
		for (const position of positions) {
			const zone = await Zone.getByPosition(location, position);
			SetUtil.merge(result, zone.getFrom(model, position) as any);
		}
		return result as any;
	}

	public static getFromFromMemory<T extends IEntity>(model: T, location: Location, positions: Vector2 | Vector2[]): Set<InstanceType<T>> {
		positions = (positions instanceof Array ? positions : [positions]);
		const result = new Set<T>;
		for (const position of positions) {
			const zone = Zone.getByPositionFromMemory(location, position);
			SetUtil.merge(result, zone.getFromFromMemory(model, position) as any);
		}
		return result as any;
	}

	public static areInDifferentZones(position1: Vector2, position2: Vector2): boolean {
		const zonePosition1 = Zone.getZonePosition(position1);
		const zonePosition2 = Zone.getZonePosition(position2);
		const diff = zonePosition1.sub(zonePosition2).abs();
		return (diff.x > 1 && diff.y > 1);
	}

	public static checkup(): void {
		const subzones = Cache.getLeaves("subzone") as Subzone[];
		for (const subzone of subzones) {
			const entities = subzone.getEntitiesFromMemory();
			for (const model of ZoneEntities.getModels()) {
				for (const entity of entities.getFromMemory(model)) {
					const positions = ("getPositions" in entity ? entity.getPositions() : [entity.position]);
					for (const position of positions) {
						if (!subzone.isInside(position)) {
							fs.appendFileSync("D:/test.txt", `[${Date.now()}] Wrong zone by ${entity.constructor.name} ${entity.id}\n`);
						}
					}
				}
			}
		}
	}

	constructor(location: Location, zonePosition: Vector2) {
		super(location, zonePosition);
		this.location = location;
		this.zonePosition = zonePosition;
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				const subzone = new Subzone(this.location, zonePosition.add(Vec2(x, y)));
				this.subzones.add(subzone);
				if (x == 0 && y == 0) {
					this.centralSubzone = subzone;
				}
			}
		}
		return this.getInstance();
	}

	/** Returns the name of this zone */
	getName(): string {
		return Zone.getNameFor(this.location, this.zonePosition);
	}

	/** Returns if this zone is loaded */
	isLoaded(): boolean {
		return this.loaded;
	}

	/** Returns the location of this zone */
	getLocation(): Location {
		return this.location;
	}

	/** Returns the zone position of this zone */
	getZonePosition(): Vector2 {
		return this.zonePosition;
	}

	/** Loads all subzones */
	async load(): Promise<void> {
		if (!this.loaded) {
			await Subzone.loadAll(this.subzones);
			this.loaded = true;
		}
	}

	/** Returns set with all subzones. Checks if the zone is loaded */
	getSubzones(): Set<Subzone> {
		assert(this.loaded);
		return this.subzones;
	}

	/** Returns set with all subzones */
	getSubzonesFromMemory(): Set<Subzone> {
		return this.subzones;
	}

	/** Returns the central subzone */
	getCentralSubzone(): Subzone {
		assert(this.loaded);
		return this.centralSubzone;
	}

	/** Returns the central subzone (probably not loaded) */
	getCentralSubzoneFromMemory(): Subzone {
		return (this.centralSubzone ? this.centralSubzone : new Subzone(this.location, this.zonePosition));
	}

	emit(event: string, data: UserData = {}): void {
		for (const subzone of this.getSubzones()) {
			subzone.emit(event, data);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}

	/** Returns `true` if the given position is inside of this zone */
	isInside(position: Vector2): boolean {
		for (const subzone of this.subzones) {
			if (subzone.isInside(position)) {
				return true;
			}
		}
		return false;
	}

	/** Removes en entity from central subzone if it is loaded */
	leave(entity: Entity): void {
		if (this.centralSubzone.isLoaded()) {
			this.centralSubzone.leave(entity);
		} else {
			fs.appendFileSync("D:/test.txt", `[${Date.now()}] ${entity.constructor.name} ${entity.id} not leaved ${this.centralSubzone.getZonePosition().x}x${this.centralSubzone.getZonePosition().y}\n`);
		}
	}

	/** Adds en entity to central subzone if it is loaded */
	enter(entity: Entity): void {
		if (this.centralSubzone.isLoaded()) {
			this.centralSubzone.enter(entity);
		} else {
			fs.appendFileSync("D:/test.txt", `[${Date.now()}] ${entity.constructor.name} ${entity.id} not entered ${this.centralSubzone.getZonePosition().x}x${this.centralSubzone.getZonePosition().y}\n`);
		}
	}

	/** Collects entities from all subzones of this zone */
	getEntities(): ZoneEntities {
		return Zone.getEntitiesFromSubzones(this.getSubzones());
	}

	/** Collects entities from all already loaded subzones of this zone */
	getEntitiesFromMemory(): ZoneEntities {
		return Zone.getEntitiesFromSubzonesFromMemory(this.subzones);
	}

	/** Returns all users from this zone */
	getUsers(): Set<User> {
		return this.getEntities().get(User);
	}

	/** Returns all already loaded users from this zone */
	getUsersFromMemory(): Set<User> {
		return this.getEntitiesFromMemory().getFromMemory(User);
	}

	/** Checks if somebody in this subzone is online. Be careful: even if someone is online, the zone may not be fully loaded yet. */
	isSomebodyOnline(): boolean {
		for (const subzone of this.subzones) {
			if (subzone.isSomebodyOnline()) {
				return true;
			}
		}
		return false;
	}

	/** Returns `true` if some tile is at the given position */
	hasTile(position: Vector2): boolean {
		assert(this.loaded);
		for (const subzone of this.getSubzones()) {
			if (subzone.isInside(position)) {
				return subzone.hasTile(position);
			}
		}
		throw new Error("Zone.hasTile: the given position is not in this zone");
	}

	/** Returns `true` if no user, (big) item etc. takes the tile at the given position */
	isTileFree(position: Vector2): boolean {
		assert(this.loaded);
		for (const subzone of this.getSubzones()) {
			if (subzone.isInside(position)) {
				return subzone.isTileFree(position);
			}
		}
		throw new Error("Zone.isTileFree: the given position is not in this zone");
	}

	getFrom<T extends IEntity>(model: T, position: Vector2): Set<InstanceType<T>> {
		assert(this.loaded);
		for (const subzone of this.getSubzones()) {
			if (subzone.isInside(position)) {
				return subzone.getFrom(model, position);
			}
		}
		throw new Error("Zone.getFrom: the given position is not in this zone");
	}

	getFromFromMemory<T extends IEntity>(model: T, position: Vector2): Set<InstanceType<T>> {
		for (const subzone of this.subzones) {
			if (subzone.isInside(position)) {
				return (subzone.isLoaded() ? subzone.getFrom(model, position) : new Set);
			}
		}
		throw new Error("Zone.getFromFromMemory: the given position is not in this zone");
	}
}