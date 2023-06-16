import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import {Rel} from "../orm/orm.typings.js";
import {Vector2} from "../util/vector.js";
import ItemType from "./item-type.entity.js";

/** Item shape entity */
export default class ItemShapePart extends Entity {
	@Property()
	id!: number;

	@Property({manyToOne: () => ItemType})
	type!: Rel<ItemType>;

	@Property({vector: true})
	position!: Vector2;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}