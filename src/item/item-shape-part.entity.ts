import {Embedded, Entity, ManyToOne} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Vector2} from "../util/vector.embeddable.js";
import ItemType from "./item-type.entity.js";

/** Item shape entity */
@Entity()
export default class ItemShapePart extends WeakCachedEntity {
	@ManyToOne()
	type: ItemType;

	@Embedded({prefix: false})
	position: Vector2;

	constructor(type: ItemType, position: Vector2, id = 0) {
		super(id);
		this.type = type;
		this.position = position;
		return this.getInstance();
	}
}