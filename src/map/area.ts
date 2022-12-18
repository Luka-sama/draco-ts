import assert from "assert/strict";
import User from "../auth/user.entity.js";
import {UserContainer} from "../core/sync.typings.js";
import {Emitter, UserData} from "../core/ws.typings.js";
import {Vec2, Vector2} from "../math/vector.embeddable.js";
import Location from "./location.entity.js";
import Subzone from "./subzone.js";

/**
 * Area of an arbitrary form
 *
 * It calculates which zones are included in the area. Then you can emit any event to the users in this area.
 * It checks for every user in the included subzones whether the user is in this area.
 */
export abstract class Area implements Emitter, UserContainer {
	private loaded = false;
	protected readonly location: Location;
	private subzones: Set<Subzone> = new Set();

	protected constructor(location: Location) {
		this.location = location;
	}

	/** Loads the subzones between `start` and `end` */
	async loadSubzones(start: Vector2, end: Vector2): Promise<void> {
		if (this.loaded) {
			return;
		}

		assert(start.x <= end.x && start.y <= end.y);
		const startZonePos = Subzone.getZonePosition(start);
		const endZonePos = Subzone.getZonePosition(end);
		for (let x = startZonePos.x; x <= endZonePos.x; x++) {
			for (let y = startZonePos.y; y <= endZonePos.y; y++) {
				const subzone = await Subzone.get(this.location, Vec2(x, y));
				this.subzones.add(subzone);
			}
		}

		this.loaded = true;
	}

	/** Returns all users from this area */
	getUsers(): Set<User> {
		this.checkIfLoaded();
		const users = new Set<User>();
		for (const subzone of this.subzones) {
			for (const user of subzone.getUsers()) {
				if (this.isInside(user)) {
					users.add(user);
				}
			}
		}
		return users;
	}

	emit(event: string, data?: UserData): void {
		const users = this.getUsers();
		for (const user of users) {
			user.emit(event, data);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}

	/** Returns `true` if the user is inside of this area */
	abstract isInside(user: User): boolean;

	/** Calculates which subzones should be loaded and loads them */
	abstract load(): Promise<void>;

	/** Throws an exception if this area is not loaded */
	private checkIfLoaded(): void {
		if (!this.loaded) {
			throw new Error("Area not loaded");
		}
	}
}

/** Area of a round form */
export class RoundArea extends Area {
	/** Position of the central tile */
	private readonly position: Vector2;
	private readonly radius: number;

	constructor(location: Location, position: Vector2, radius: number) {
		super(location);
		this.position = position;
		this.radius = radius;
	}

	async load(): Promise<void> {
		const start = this.position.sub(Vec2(this.radius));
		const end = this.position.add(Vec2(this.radius));
		await this.loadSubzones(start, end);
	}

	isInside(user: User): boolean {
		const userPos = user.position, thisPos = this.position;
		const square = (n: number): number => n * n;
		const distance = square(userPos.x - thisPos.x) + square(userPos.y - thisPos.y) - square(this.radius);
		return distance <= 0;
	}
}