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
	private users: User[] = [];
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
		this.users = await EM.find(User, {location: this.location, position: {
			x: {$gte: this.start.x, $lt: this.end.x},
			y: {$gte: this.start.y, $lt: this.end.y}
		}});
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
		const i = this.users.indexOf(user);
		if (i == -1) {
			return;
		}

		this.users.splice(i, 1);
		this.emit("move", WS.prepare(user, ["id", "position"]));
	}

	enter(user: User) {
		if (!this.users.includes(user)) {
			this.users.push(user);
		}
	}

	async emitAll(user: User) {
		const users = await this.getVisibleUsers();
		user.emit("load_zone", {
			me: user.id,
			users: WS.prepare(users, ["id", "name", "position"]),
		});
	}

	async emitToAll(event: string, data: UserData = {}) {
		const users = await this.getVisibleUsers();
		for (const user of users) {
			user.emit(event, data);
		}
	}

	async getVisibleUsers(): Promise<User[]> {
		const users: User[] = [];
		await this.toAllAdjacent(zone => users.push(...zone.users));
		return users;
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