import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";

/** Tileset entity */
@Entity()
export default class TileSet {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	name: string;

	constructor(name: string) {
		this.name = name;
	}
}