/** Tileset entity */
import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";

export default class Tileset extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}