import assert from "assert/strict";
import User from "../auth/user.entity.js";
import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import Location from "../map/location.entity.js";
import Collection from "../orm/collection.js";
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import {Rel} from "../orm/orm.typings.js";
import {Vector2} from "../util/vector.js";
import Light from "./light.entity.js";

/** Lights group entity */
export default class LightsGroup extends Entity {
	@Property()
	id!: number;

	/** Shape. Each lights group consists of some number of lights, each located in its own tile */
	@Property({oneToMany: [Light, "lightsGroup"]})
	shape!: Collection<Light>;

	/** Speed. May change randomly */
	@Property()
	@Sync(SyncFor.Zone)
	speed!: number;

	/**
	 * Flight direction. May change randomly. Every 100 ms - 75% probability that the lights group will fly to (or from) the target
	 * (imprecise, since each coordinate of direction is -1, 0 or 1; but will be adjusted during the flight),
	 * 25% probability - any other direction.
	 */
	@Property({vector: true})
	direction!: Vector2;

	@Property({manyToOne: () => Location})
	location!: Location;

	@Property({vector: true})
	@Sync(SyncFor.Zone)
	position!: Vector2;

	/** The mage the lights group flies to (or from). When the mage moves, the direction is adjusted from time to time (see `direction` for details) */
	@Property({manyToOne: () => User})
	targetMage!: Rel<User>;

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

	getPositions(position = this.position): Vector2[] {
		assert(this.shape.isInitialized());
		return this.shape
			.getItems()
			.map(light => position.add(light.position));
	}
}