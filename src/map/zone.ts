import User from "../auth/user.entity";
import CachedObject from "../cache/cached-object";
import {Vec2, Vector2} from "../vector.embeddable";
import WS, {EM} from "../ws";
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

	emit(user: User) {
		user.emit("load_zone", {
			me: user.id,
			users: WS.prepare(this.users, ["id", "name", "position"]),
		});
	}

	isInside(userPosition: Vector2) {
		this.checkIfLoaded();
		return Zone.getPosition(userPosition).equals(this.position);
		/*if (tile.x >= this.start.x && tile.y >= this.start.y) {
			return (tile.x < this.end.x && tile.y < this.end.y);
		}
		return false;*/
	}

	unsub(user: User) {
		WS.unsub(user, WS.getTopics(user, "zone/"));
	}

	sub(user: User) {
		WS.sub(user, this.getName());
	}

	leave(user: User) {
		this.unsub(user);
		const i = this.users.indexOf(user);
		if (i == -1) {
			return;
		}

		this.users.splice(i, 1);
		WS.pub(this.getName(), "change_zone", WS.prepare(user, ["id", "position"]));
	}

	enter(user: User) {
		this.sub(user);
		if (!this.users.includes(user)) {
			this.users.push(user);
		}
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
}