import {AnyEntity} from "@mikro-orm/core";
import User from "../auth/user.entity";
import CachedObject from "../cache/cached-object";
import {Vec2, Vector2} from "../math/vector.embeddable";
import {Emitter, UserData} from "../core/ws.typings";
import Location from "./location.entity";
import Subzone from "./subzone";
import ZoneEntities from "./zone-entities";

export default class Zone extends CachedObject implements Emitter {
	static readonly SIZE = Subzone.SIZE.mul(3);
	private loaded = false;
	private readonly location: Location;
	private readonly mapPosition: Vector2;
	private subzones: Set<Subzone> = new Set();
	private centralSubzone!: Subzone;
	constructor(location: Location, mapPosition: Vector2) {
		super(location, mapPosition);
		this.location = location;
		this.mapPosition = mapPosition;
		return this.getInstance();
	}

	async load(): Promise<void> {
		if (this.loaded) {
			return;
		}

		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				const mapPos = this.mapPosition.add(Vec2(x, y));
				const subzone = new Subzone(this.location, mapPos);
				await subzone.load();
				this.subzones.add(subzone);
				if (x == 0 && y == 0) {
					this.centralSubzone = subzone;
				}
			}
		}

		this.loaded = true;
	}

	getName(): string {
		return Zone.getNameFor(this.location, this.mapPosition);
	}

	/*isInside(userPosition: Vector2): boolean {
		this.checkIfLoaded();
		return Zone.getPosition(userPosition).equals(this.mapPosition);
		/*if (tile.x >= this.start.x && tile.y >= this.start.y) {
			return (tile.x < this.end.x && tile.y < this.end.y);
		}
		return false;*
	}*/

	leave(entity: AnyEntity): void {
		this.centralSubzone.leave(entity);
	}

	enter(entity: AnyEntity): void {
		this.centralSubzone.enter(entity);
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

	getModels(): string[] {
		return this.centralSubzone.getEntities().getModels();
	}

	getEntities(): ZoneEntities {
		this.checkIfLoaded();
		return Zone.getEntitiesFromSubzones(this.subzones);
	}

	static getEntitiesFromSubzones(subzones: Set<Subzone>): ZoneEntities {
		const zoneEntities = new ZoneEntities();
		subzones.forEach(subzone => zoneEntities.merge(subzone.getEntities()));
		return zoneEntities;
	}

	getNewSubzones(oldZone: Zone): Set<Subzone> {
		const result: Set<Subzone> = new Set();
		for (const subzone of this.subzones) {
			if (!oldZone.subzones.has(subzone)) {
				result.add(subzone);
			}
		}
		return result;
	}

	getLeftSubzones(oldZone: Zone): Set<Subzone> {
		return oldZone.getNewSubzones(this);
	}

	static getMapPosition(userPosition: Vector2): Vector2 {
		return Subzone.getMapPosition(userPosition);
	}

	static async getByPosition(location: Location, userPosition: Vector2): Promise<Zone> {
		const zonePosition = Zone.getMapPosition(userPosition);
		return await Zone.get(location, zonePosition);
	}

	static async getByUser(user: User): Promise<Zone> {
		return await Zone.getByPosition(user.location, user.position);
	}

	static async get(location: Location, mapPosition: Vector2): Promise<Zone> {
		const zone: Zone = new Zone(location, mapPosition);
		await zone.load();
		return zone;
	}

	static getNameFor(location: Location, mapPosition: Vector2): string {
		return `zone/location${location.id}/${mapPosition.x}x${mapPosition.y}`;
	}

	private checkIfLoaded(): void {
		if (!this.loaded) {
			throw new Error("Zone not loaded");
		}
	}
}