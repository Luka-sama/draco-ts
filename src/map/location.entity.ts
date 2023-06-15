import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";

/** Location entity */
export default class Location extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;
}