import {Embedded, Entity, ManyToOne} from "@mikro-orm/core";
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

	getPositions(position = this.position, excludeNegative = false): Vector2[] {
		const shapeParts = this.type.shape.getItems().filter(shapePart => (
			!excludeNegative || shapePart.position.x >= 0 && shapePart.position.y >= 0
		));
		return shapeParts.map(shapePart => {
			// Correct shape for odd Y because we have staggered isometric map
			const shouldCorrect = (position.y % 2 == 1 && shapePart.position.y % 2 == 1);
			const offset = (shouldCorrect ? shapePart.position.add(Vec2(1, 0)) : shapePart.position);
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