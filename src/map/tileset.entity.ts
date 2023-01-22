import {Entity, Property, Unique} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";

/** Tileset entity */
@Entity()
export default class Tileset extends WeakCachedEntity {
	@Unique()
	@Property()
	name: string;

	constructor(name: string, id = 0) {
		super(id);
		this.name = name;
		return this.getInstance();
	}
}