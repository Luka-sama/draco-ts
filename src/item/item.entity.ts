import {Embedded, Entity, ManyToOne} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import Location from "../map/location.entity.js";
import {Vector2} from "../util/vector.embeddable.js";
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

	getPositions(position = this.position): Vector2[] {
		return this.type.shape.getItems().map(shapePart => position.add(shapePart.position));
	}

	constructor(type: ItemType, location: Location, position: Vector2, id = 0) {
		super(id);
		this.type = type;
		this.location = location;
		this.position = position;
		return this.getInstance();
	}
}