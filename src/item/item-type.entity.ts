import {Collection, Entity, OneToMany, Property} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import ItemShapePart from "./item-shape-part.entity.js";

/** Item type entity */
@Entity()
export default class ItemType extends WeakCachedEntity {
	@Property()
	name: string;

	@OneToMany({mappedBy: (itemShapePart: ItemShapePart) => itemShapePart.type})
	shape = new Collection<ItemShapePart>(this);

	@Property()
	height: number;

	constructor(name: string, height: number, id = 0) {
		super(id);
		this.name = name;
		this.height = height;
		return this.getInstance();
	}
}