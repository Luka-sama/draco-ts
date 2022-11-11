import {Entity, Property, Unique} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity";

/** Location entity */
@Entity()
export default class Location extends WeakCachedEntity {
	@Unique()
	@Property()
	name: string;

	constructor(name: string, id = 0) {
		super(id);
		this.name = name;
		return this.getInstance();
	}
}