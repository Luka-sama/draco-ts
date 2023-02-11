import {Embedded, Entity, ManyToOne, Rel} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity.js";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import Location from "../map/location.entity.js";
import {Vec2, Vector2} from "../util/vector.embeddable.js";
import ItemType from "./item-type.entity.js";

/** Item entity */
@Entity()
export default class Item extends WeakCachedEntity {
	@ManyToOne()
	@Sync({for: SyncFor.Zone, map: ["name", "height"]})
	type: ItemType;

	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	@Sync(SyncFor.Zone)
	position: Vector2;

	@ManyToOne()
	@Sync({for: SyncFor.Zone, map: "id", default: 0})
	holder?: Rel<User>;

	getPositions(position = this.position, excludeNegative = false): Vector2[] {
		assert(this.type.shape.isInitialized());
		const shape = this.type.shape
			.getItems()
			.map(shapePart => shapePart.position)
			.filter(shapePart => !excludeNegative || shapePart.x >= 0 && shapePart.y >= 0);
		return shape.map(shapePart => {
			// Correct shape for odd Y because we have staggered isometric map
			const shouldCorrect = (position.y % 2 == 1 && shapePart.y % 2 == 1);
			const offset = (shouldCorrect ? shapePart.add(Vec2(1, 0)) : shapePart);
			return position.add(offset);
		});
	}

	constructor(type: ItemType, location: Location, position: Vector2, id = 0) {
		super(id);
		this.type = type;
		this.location = location;
		this.position = position;
		return this.getInstance();
	}
}