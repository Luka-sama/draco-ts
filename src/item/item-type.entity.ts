import Collection from "../orm/collection.js";
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import ItemShapePart from "./item-shape-part.entity.js";

/** Item type entity */
export default class ItemType extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;

	@Property({oneToMany: [ItemShapePart, "type"]})
	shape!: Collection<ItemShapePart>;

	@Property()
	height!: number;

	@Property()
	walkable!: boolean;

	@Property()
	takable!: boolean;

	@Property()
	weight!: number;
}