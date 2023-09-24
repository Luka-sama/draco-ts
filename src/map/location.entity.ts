import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";

/** Location entity */
export default class Location extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}