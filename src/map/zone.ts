import {AnyEntity, EntityClass} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity.js";
import Cache from "../cache/cache.js";
import CachedObject from "../cache/cached-object.js";
import {Receiver, UserData} from "../core/ws.typings.js";
import SetUtil from "../util/set-util.js";
import {Vec2, Vector2} from "../util/vector.embeddable.js";
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
	private loaded = false;
	private readonly location: Location;
	private readonly zonePosition: Vector2;
	private subzones: Set<Subzone> = new Set();
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
	static async getByEntity(entity: AnyEntity): Promise<Zone> {
		return await Zone.getByPosition(entity.location, entity.position);
	}

	/** Returns a (probably) not loaded zone by a given location and position */
	static getByPositionFromMemory(location: Location, position: Vector2): Zone {
		const zonePosition = Zone.getZonePosition(position);
		return new Zone(location, zonePosition);
	}

	/** Returns multiple (probably) not loaded zones by a given location and multiple positions */
	static getByPositionsFromMemory(location: Location, positions: Vector2[]): Set<Zone> {
		const zones = new Set<Zone>();
		for (const position of positions) {
			const zone = Zone.getByPositionFromMemory(location, position);
			if (zone) {
				zones.add(zone);
			}
		}
		return zones;
	}

	/** Returns a (probably) not loaded zone by a given entity with location and position */
	static getByEntityFromMemory(entity: AnyEntity): Zone {
		return Zone.getByPositionFromMemory(entity.location, entity.position);
	}

	/** Collects entities from all given subzones */
	static getEntitiesFromSubzones(subzones: Set<Subzone>): ZoneEntities {
		const zoneEntities = new ZoneEntities();
		subzones.forEach(subzone => zoneEntities.merge(subzone.getEntities()));
		return zoneEntities;
	}

	/** Collects entities from all given subzones */
	static getEntitiesFromSubzonesFromMemory(subzones: Set<Subzone>): ZoneEntities {
		const zoneEntities = new ZoneEntities();
		subzones.forEach(subzone => zoneEntities.merge(subzone.getEntitiesFromMemory()));
		return zoneEntities;
	}

	/** Returns a list of subzones that are in the given zones */
	static getSubzonesFrom(zones: Set<Zone>): Set<Subzone> {
		const subzones = new Set<Subzone>();
		zones.forEach(zone => SetUtil.merge(subzones, zone.getSubzonesFromMemory()));
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

	public static async getFrom<T extends AnyEntity>(model: EntityClass<T>, location: Location, positions: Vector2 | Vector2[]): Promise<Set<T>> {
		positions = (positions instanceof Array ? positions : [positions]);
		const result = new Set<T>;
		for (const position of positions) {
			const zone = await Zone.getByPosition(location, position);
			SetUtil.merge(result, zone.getFrom(model, position));
		}
		return result;
	}

	public static getFromFromMemory<T extends AnyEntity>(model: EntityClass<T>, location: Location, positions: Vector2 | Vector2[]): Set<T> {
		positions = (positions instanceof Array ? positions : [positions]);
		const result = new Set<T>;
		for (const position of positions) {
			const zone = Zone.getByPositionFromMemory(location, position);
			SetUtil.merge(result, zone.getFromFromMemory(model, position));
		}
		return result;
	}

	constructor(location: Location, zonePosition: Vector2) {
		super(location, zonePosition);
		this.location = location;
		this.zonePosition = zonePosition;
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
		if (this.loaded) {
			return;
		}

		this.subzones = this.getSubzonesFromMemory();
		for (const subzone of this.subzones) {
			if (subzone.getZonePosition().equals(this.zonePosition)) {
				this.centralSubzone = subzone;
			}
		}
		await Subzone.loadAll(this.subzones);

		this.loaded = true;
	}

	/** Returns set with all subzones */
	getSubzones(): Set<Subzone> {
		assert(this.loaded);
		return this.subzones;
	}

	getSubzonesFromMemory(): Set<Subzone> {
		if (this.loaded) {
			return this.subzones;
		}

		const subzones = new Set<Subzone>;
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				const zonePos = this.zonePosition.add(Vec2(x, y));
				const subzone = new Subzone(this.location, zonePos);
				subzones.add(subzone);
			}
		}
		return subzones;
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
		for (const subzone of this.getSubzonesFromMemory()) {
			if (subzone.isInside(position)) {
				return true;
			}
		}
		return false;
	}

	/** Removes en entity from central subzone if it is loaded */
	leave(entity: AnyEntity): void {
		const centralSubzone = this.getCentralSubzoneFromMemory();
		if (centralSubzone.isLoaded()) {
			centralSubzone.leave(entity);
		}
	}

	/** Adds en entity to central subzone if it is loaded */
	enter(entity: AnyEntity): void {
		const centralSubzone = this.getCentralSubzoneFromMemory();
		if (centralSubzone.isLoaded()) {
			centralSubzone.enter(entity);
		}
	}

	/** Collects entities from all subzones of this zone */
	getEntities(): ZoneEntities {
		return Zone.getEntitiesFromSubzones(this.getSubzones());
	}

	/** Collects entities from all already loaded subzones of this zone */
	getEntitiesFromMemory(): ZoneEntities {
		return Zone.getEntitiesFromSubzonesFromMemory(this.getSubzonesFromMemory());
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

	getFrom<T extends AnyEntity>(model: EntityClass<T>, position: Vector2): Set<T> {
		assert(this.loaded);
		for (const subzone of this.getSubzones()) {
			if (subzone.isInside(position)) {
				return subzone.getFrom(model, position);
			}
		}
		throw new Error("Zone.getFrom: the given position is not in this zone");
	}

	getFromFromMemory<T extends AnyEntity>(model: EntityClass<T>, position: Vector2): Set<T> {
		for (const subzone of this.getSubzonesFromMemory()) {
			if (subzone.isInside(position)) {
				return (subzone.isLoaded() ? subzone.getFrom(model, position) : new Set);
			}
		}
		throw new Error("Zone.getFromFromMemory: the given position is not in this zone");
	}
}