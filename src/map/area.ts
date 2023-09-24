import assert from "assert/strict";
import User from "../auth/user.entity.js";
import {UserContainer} from "../draco-ts/sync/sync.typings.js";
import {UserData} from "../draco-ts/util/validation.js";
import {Vec2, Vector2} from "../draco-ts/util/vector.js";
import {Receiver} from "../draco-ts/ws.js";
import Location from "./location.entity.js";
import Subzone from "./subzone.js";

/**
 * Area of an arbitrary form
 *
 * It calculates which zones are included in the area. Then you can emit any event to the users in this area.
 * It checks for every user in the included subzones whether the user is in this area.
 */
export abstract class Area implements Receiver, UserContainer {
	private loaded = false;
	private areSubzonesSet = false;
	protected readonly location: Location;
	private subzones: Set<Subzone> = new Set();

	protected constructor(location: Location) {
		this.location = location;
	}

	/** Sets the subzones between `start` and `end` */
	protected setSubzonesByCoords(start: Vector2, end: Vector2): void {
		if (this.areSubzonesSet) {
			return;
		}

		assert(start.x <= end.x && start.y <= end.y);
		const startZonePos = Subzone.getZonePosition(start);
		const endZonePos = Subzone.getZonePosition(end);
		for (let x = startZonePos.x; x <= endZonePos.x; x++) {
			for (let y = startZonePos.y; y <= endZonePos.y; y++) {
				const subzone = new Subzone(this.location, Vec2(x, y));
				this.subzones.add(subzone);
			}
		}

		this.areSubzonesSet = true;
	}

	/** Returns all users from this area */
	getUsers(): Set<User> {
		this.checkIfLoaded();
		const users = new Set<User>;
		for (const subzone of this.subzones) {
			for (const user of subzone.getUsers()) {
				if (this.isInside(user)) {
					users.add(user);
				}
			}
		}
		return users;
	}

	/** Returns all already loaded users from this area */
	getUsersFromMemory(): Set<User> {
		const users = new Set<User>;
		for (const subzone of this.subzones) {
			for (const user of subzone.getUsersFromMemory()) {
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
	public abstract isInside(user: User): boolean;

	/** Calculates which subzones are inside of this area and sets them to a property */
	public abstract setSubzones(): void;

	/** Calculates which subzones should be loaded (if not already done) and loads them */
	public async load(): Promise<void> {
		if (!this.areSubzonesSet) {
			this.setSubzones();
		}
		await Subzone.loadAll(this.subzones);
	}

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

	public setSubzones(): void {
		const start = this.position.sub(Vec2(this.radius));
		const end = this.position.add(Vec2(this.radius));
		this.setSubzonesByCoords(start, end);
	}

	public isInside(user: User): boolean {
		const userPos = user.position, thisPos = this.position;
		const square = (n: number): number => n * n;
		const distance = square(userPos.x - thisPos.x) + square(userPos.y - thisPos.y) - square(this.radius);
		return distance <= 0;
	}
}