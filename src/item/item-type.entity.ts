import Collection from "../draco-ts/orm/collection.js";
import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";
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

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}