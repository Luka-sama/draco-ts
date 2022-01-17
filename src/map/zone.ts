import _ from "lodash";
import User from "../auth/user.entity";
import Cache from "../cache";
import {Vec2, Vector2} from "../vector";
import WS, {EM} from "../ws";
import Location from "./location.entity";

export default class Zone {
	static readonly SIZE = Vec2(16, 16);
	private loaded = false;
	private location: Location;
	private position: Vector2;
	private users: User[] = [];
	private get start() {
		return this.position.mul(Zone.SIZE);
	}
	private get end() {
		return this.start.add(Zone.SIZE);
	}

	private constructor(location: Location, position: Vector2) {
		this.location = location;
		this.position = position;
	}

	async load(em: EM) {
		if (this.loaded) {
			return;
		}
		const foundUsers = (await em.find(User, {location: this.location, $and: [
				{x: {$gte: this.start.x, $lt: this.end.x}},
				{y: {$gte: this.start.y, $lt: this.end.y}}
		]}));
		this.users = [];
		for (const foundUser of foundUsers) {
			const user = await User.get(em, foundUser.id);
			this.users.push(user);
		}
		this.loaded = true;
	}

	getName() {
		return Zone.getNameByParameters(this.location, this.position);
	}

	emit(user: User) {
		const users = this.users.map(user => _.pick(user, ["id", "name", "x", "y"]));
		user.emit("load_zone", {me: user.id, users});
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
		const topics = user.socket!.getTopics();
		for (const topic of topics) {
			if (topic.startsWith("position/")) {
				WS.unsub(user, topic);
			}
		}
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
		//WS.pub(this.getName(), "change_zone", {id: user.id, position: user.position.toPlain()});
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
		const name = Zone.getNameByParameters(location, position);
		const zone: Zone = Cache.getOrSet(name, () => new Zone(location, position));
		await zone.load(em);
		return zone;
	}

	private static getNameByParameters(location: Location, position: Vector2) {
		return `position/loc${location.id}/zone${position.x}x${position.y}`;
	}

	private checkIfLoaded() {
		if (!this.loaded) {
			throw new Error("Zone not loaded");
		}
	}
}