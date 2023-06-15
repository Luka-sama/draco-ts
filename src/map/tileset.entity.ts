/** Tileset entity */
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";

export default class Tileset extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;
}