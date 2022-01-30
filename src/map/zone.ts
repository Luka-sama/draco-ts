import {AnyEntity, ChangeSet} from "@mikro-orm/core";
import User from "../auth/user.entity";
import CachedObject from "../cache/cached-object";
import {EM} from "../orm";
import {Vec2, Vector2} from "../vector.embeddable";
import WS, {UserData} from "../ws";
import Location from "./location.entity";

export default class Zone extends CachedObject {
	static readonly SIZE = Vec2(16, 16);
	private loaded = false;
	private readonly location: Location;
	private readonly position: Vector2;
	private users: Set<User> = new Set();
	private get start() {
		return this.position.mul(Zone.SIZE);
	}
	private get end() {
		return this.start.add(Zone.SIZE);
	}

	constructor(location: Location, position: Vector2) {
		super(location, position);
		this.location = location;
		this.position = position;
		return this.getInstance();
	}

	async load() {
		if (this.loaded) {
			return;
		}
		const where = {location: this.location, position: {
			x: {$gte: this.start.x, $lt: this.end.x},
			y: {$gte: this.start.y, $lt: this.end.y}
		}};
		this.users = new Set( await EM.find(User, where) );
		this.loaded = true;
	}

	getName() {
		return Zone.getNameFor(this.location, this.position);
	}

	isInside(userPosition: Vector2) {
		this.checkIfLoaded();
		return Zone.getPosition(userPosition).equals(this.position);
		/*if (tile.x >= this.start.x && tile.y >= this.start.y) {
			return (tile.x < this.end.x && tile.y < this.end.y);
		}
		return false;*/
	}

	leave(user: User) {
		this.users.delete(user);
		this.emit("move", WS.prepare(user, ["id", "position"]));
	}

	enter(user: User) {
		this.users.add(user);
	}

	async changeTo(user: User, oldZone: Zone) {
		if (oldZone != this) {
			oldZone.leave(user);
			this.enter(user);
			await this.emitAll(user);
		}
	}

	static async changeHandler(changeSet: ChangeSet<AnyEntity>) {
		const original = changeSet.originalEntity;
		if (!original) {
			return;
		}
		const oldPosition = Vec2(original.x, original.y);
		const oldLocation = await EM.findOneOrFail(Location, {id: original.location});
		const oldZone = await Zone.getByUserPosition(oldLocation, oldPosition);

		const entity = changeSet.entity;
		const newZone = await Zone.getByUserPosition(entity.location, entity.position);
		await newZone.changeTo(changeSet.entity as User, oldZone);
	}

	async emitAll(user: User) {
		const users = await this.getVisibleUsers();
		user.emit("load_zone", {
			me: user.id,
			users: WS.prepare(users, ["id", "name", "position"]),
		});
	}

	async emitToAll(event: string, data: UserData = {}) {
		const users = await this.getConnectedUsers();
		for (const user of users) {
			user.emit(event, data);
		}
	}

	async getVisibleUsers(): Promise<Set<User>> {
		const users: User[] = [];
		await this.toAllAdjacent(zone => users.push(...zone.users));
		return new Set(users);
	}

	async getConnectedUsers(): Promise<Set<User>> {
		const users: User[] = [];
		await this.toAllAdjacent(zone => users.push(...zone.users));
		return new Set( users.filter(user => user.connected) );
	}

	static getPosition(userPosition: Vector2) {
		return userPosition.intdiv(Zone.SIZE);
	}

	static async getByUserPosition(location: Location, userPosition: Vector2) {
		const zonePosition = Zone.getPosition(userPosition);
		return await Zone.get(location, zonePosition);
	}

	static async getByUser(user: User) {
		return Zone.getByUserPosition(user.location, user.position);
	}

	static async get(location: Location, position: Vector2) {
		const zone: Zone = new Zone(location, position);
		await zone.load();
		return zone;
	}

	static getNameFor(location: Location, position: Vector2) {
		return `zone/location${location.id}/${position.x}x${position.y}`;
	}

	private checkIfLoaded() {
		if (!this.loaded) {
			throw new Error("Zone not loaded");
		}
	}

	private async toAllAdjacent(func: (zone: Zone) => void) {
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				const newPos = this.position.add(Vec2(x, y));
				const zone = new Zone(this.location, newPos);
				await zone.load();
				func(zone);
			}
		}
	}

	private emit(event: string, data: UserData = {}) {
		for (const user of this.users) {
			user.emit(event, data);
		}
	}
}