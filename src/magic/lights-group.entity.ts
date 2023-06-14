import {Collection, Embedded, Entity, ManyToOne, OneToMany, Property, Rel} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity.js";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Task} from "../core/game-loop.js";
import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import Location from "../map/location.entity.js";
import {Vector2} from "../util/vector.embeddable.js";
import Light from "./light.entity.js";

/** Lights group entity */
@Entity()
export default class LightsGroup extends WeakCachedEntity {
	/** Shape. Each lights group consists of some number of lights, each located in its own tile */
	@OneToMany({mappedBy: (light: Light) => light.lightsGroup})
	shape = new Collection<Light>(this);

	/** Speed. May change randomly */
	@Property()
	@Sync(SyncFor.Zone)
	speed: number;

	/**
	 * Flight direction. May change randomly. Every 100 ms - 75% probability that the lights group will fly to (or from) the target
	 * (imprecise, since each coordinate of direction is -1, 0 or 1; but will be adjusted during the flight),
	 * 25% probability - any other direction.
	 */
	@Embedded()
	direction: Vector2;

	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	@Sync(SyncFor.Zone)
	position: Vector2;

	/** The mage the lights group flies to (or from). When the mage moves, the direction is adjusted from time to time (see `direction` for details) */
	@ManyToOne()
	targetMage: Rel<User>;

	/**
	 * Flies the light group to the target (`true`) or from the target (`false`)? If the lights group is close enough to the target
	 * (<= 3-5 tiles, strict lower limit, soft upper, so at the distance 4 tiles the flag can already be inverted, but does not have to be),
	 * this flag will be inverted. As soon as a lights group is in another zone than the target mage, the flag is inverted again.
	 */
	@Property()
	toTarget = true;

	/**
	 * Is the lights group activated? If yes, the collisions with all living beings are checked.
	 * In the collision, the lights group is deleted and the magic happens.
	 */
	@Property()
	activated = false;

	lastMovement = 0;

	task!: Task;

	constructor(speed: number, direction: Vector2, location: Location, position: Vector2, targetMage: Rel<User>, id = 0) {
		super(id);
		this.speed = speed;
		this.direction = direction;
		this.location = location;
		this.position = position;
		this.targetMage = targetMage;
		return this.getInstance();
	}

	getPositions(position = this.position): Vector2[] {
		assert(this.shape.isInitialized());
		return this.shape
			.getItems()
			.map(light => position.add(light.position));
	}
}