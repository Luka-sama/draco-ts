import {AnyEntity} from "@mikro-orm/core";
import CachedObject from "../cache/cached-object.js";
import {Emitter, UserData} from "../core/ws.typings.js";
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
export default class Zone extends CachedObject implements Emitter {
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

	/** Returns a loaded zone by a given location and zone position */
	static async get(location: Location, zonePosition: Vector2): Promise<Zone> {
		const zone = new Zone(location, zonePosition);
		await zone.load();
		return zone;
	}

	/** Collects entities from all given subzones */
	static getEntitiesFromSubzones(subzones: Set<Subzone>): ZoneEntities {
		const zoneEntities = new ZoneEntities();
		subzones.forEach(subzone => zoneEntities.merge(subzone.getEntities()));
		return zoneEntities;
	}

	/** Returns a list of subzones that are in the given zones */
	static getSubzonesFrom(zones: Set<Zone>) {
		const subzones = new Set<Subzone>();
		zones.forEach(zone => SetUtil.merge(subzones, zone.subzones));
		return subzones;
	}

	/** Returns a list of subzones that are in this zone, but not in the old one */
	static getNewSubzones(oldZones: Set<Zone>, currZones: Set<Zone>): Set<Subzone> {
		const currSubzones = Zone.getSubzonesFrom(currZones);
		const oldSubzones = Zone.getSubzonesFrom(oldZones);
		return SetUtil.difference(currSubzones, oldSubzones);
	}

	/** Returns a list of subzones that are in the old zone, but not in this zone */
	static getLeftSubzones(oldZones: Set<Zone>, currZones: Set<Zone>): Set<Subzone> {
		return Zone.getNewSubzones(currZones, oldZones);
	}

	/** Returns a list of subzones that are both in the old zone and in this */
	static getRemainingSubzones(oldZones: Set<Zone>, currZones: Set<Zone>): Set<Subzone> {
		const currSubzones = Zone.getSubzonesFrom(currZones);
		const oldSubzones = Zone.getSubzonesFrom(oldZones);
		return SetUtil.intersection(currSubzones, oldSubzones);
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

	/** Loads all subzones */
	async load(): Promise<void> {
		if (this.loaded) {
			return;
		}

		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				const zonePos = this.zonePosition.add(Vec2(x, y));
				const subzone = await Subzone.get(this.location, zonePos);
				this.subzones.add(subzone);
				if (x == 0 && y == 0) {
					this.centralSubzone = subzone;
				}
			}
		}

		this.loaded = true;
	}

	/** Returns set with all subzones */
	getSubzones(): Set<Subzone> {
		return this.subzones;
	}

	emit(event: string, data: UserData = {}): void {
		this.checkIfLoaded();
		for (const subzone of this.subzones) {
			subzone.emit(event, data);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}

	/** Returns `true` if the given position is inside of this zone */
	isInside(position: Vector2): boolean {
		this.checkIfLoaded();
		for (const subzone of this.subzones) {
			if (subzone.isInside(position)) {
				return true;
			}
		}
		return false;
	}

	/** Removes en entity from central subzone */
	leave(entity: AnyEntity): void {
		this.centralSubzone.leave(entity);
	}

	/** Adds en entity to central subzone */
	enter(entity: AnyEntity): void {
		this.centralSubzone.enter(entity);
	}

	/** Collects entities from all subzones of this zone */
	getEntities(): ZoneEntities {
		this.checkIfLoaded();
		return Zone.getEntitiesFromSubzones(this.subzones);
	}

	/** Returns `true` if some tile is at the given position */
	hasTile(position: Vector2): boolean {
		for (const subzone of this.subzones) {
			if (subzone.isInside(position)) {
				return subzone.hasTile(position);
			}
		}
		throw new Error("Zone.hasTile: the given position is not in this zone");
	}

	/** Returns `true` if no user, (big) item etc. takes the tile at the given position */
	isTileFree(position: Vector2): boolean {
		for (const subzone of this.subzones) {
			if (subzone.isInside(position)) {
				return subzone.isTileFree(position);
			}
		}
		throw new Error("Zone.isTileFree: the given position is not in this zone");
	}

	/** Throws an exception if this zone is not loaded */
	private checkIfLoaded(): void {
		if (!this.loaded) {
			throw new Error("Zone not loaded");
		}
	}
}