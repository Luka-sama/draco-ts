import User from "../auth/user.entity";
import CachedObject from "../cache/cached-object";
import {Vec2, Vector2} from "../vector.embeddable";
import WS, {EM, UserData} from "../ws";
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
	}

	async load(em: EM) {
		if (this.loaded) {
			return;
		}
		this.users = await em.find(User, {location: this.location, position: {
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

	enter(em: EM, user: User) {
		if (!this.users.includes(user)) {
			this.users.push(user);
		}
	}

	async emitAll(em: EM, user: User) {
		const users = await this.getVisibleUsers(em);
		user.emit("load_zone", {
			me: user.id,
			users: WS.prepare(users, ["id", "name", "position"]),
		});
	}

	async emitToAll(em: EM, event: string, data: UserData = {}) {
		const users = await this.getVisibleUsers(em);
		for (const user of users) {
			user.emit(event, data);
		}
	}

	async getVisibleUsers(em: EM): Promise<User[]> {
		const users: User[] = [];
		await this.toAllAdjacent(em, zone => users.push(...zone.users));
		return users;
	}

	static getPosition(userPosition: Vector2) {
		return userPosition.intdiv(Zone.SIZE);
	}

	static getByUserPosition(em: EM, location: Location, userPosition: Vector2) {
		const zonePosition = Zone.getPosition(userPosition);
		return Zone.get(em, location, zonePosition);
	}

	static async getByUser(em: EM, user: User) {
		return Zone.getByUserPosition(em, user.location, user.position);
	}

	static async get(em: EM, location: Location, position: Vector2) {
		const zone: Zone = new Zone(location, position);
		await zone.load(em);
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

	private async toAllAdjacent(em: EM, func: (zone: Zone) => void) {
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				const newPos = this.position.add(Vec2(x, y));
				const zone = new Zone(this.location, newPos);
				await zone.load(em);
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