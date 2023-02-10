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

	@Property()
	walkable: boolean;

	@Property()
	takable: boolean;

	@Property()
	weight: number;

	constructor(name: string, height: number, walkable: boolean, takable: boolean, weight: number, id = 0) {
		super(id);
		this.name = name;
		this.height = height;
		this.walkable = walkable;
		this.takable = takable;
		this.weight = weight;
		const instance = this.getInstance();
		return instance;
	}
}