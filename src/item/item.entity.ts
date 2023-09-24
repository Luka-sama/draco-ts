import assert from "assert/strict";
import User from "../auth/user.entity.js";
import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";
import {Rel} from "../draco-ts/orm/orm.typings.js";
import {Sync} from "../draco-ts/sync/sync.decorator.js";
import {SyncFor} from "../draco-ts/sync/sync.typings.js";
import {Vec2, Vector2} from "../draco-ts/util/vector.js";
import Location from "../map/location.entity.js";
import ItemType from "./item-type.entity.js";

/** Item entity */
export default class Item extends Entity {
	@Property()
	id!: number;

	@Property({manyToOne: () => ItemType})
	@Sync({for: SyncFor.Zone, map: ["name", "height"]})
	type!: ItemType;

	@Property({manyToOne: () => Location})
	location!: Location;

	@Property({vector: true})
	@Sync(SyncFor.Zone)
	position!: Vector2;

	@Property({manyToOne: () => User})
	@Sync({for: SyncFor.Zone, map: "id", default: 0})
	holder?: Rel<User>;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}

	getPositions(position = this.position, excludeNegative = false): Vector2[] {
		assert(this.type.shape.isInitialized());
		return this.type.shape
			.getItems()
			.map(shapePart => shapePart.position)
			.filter(shapePart => !excludeNegative || shapePart.x >= 0 && shapePart.y >= 0)
			.map(shapePart => {
				// Correct shape for odd Y because we have staggered isometric map
				const shouldCorrect = (position.y % 2 != 0 && shapePart.y % 2 != 0);
				const offset = (shouldCorrect ? shapePart.add(Vec2(1, 0)) : shapePart);
				return position.add(offset);
			});
	}
}