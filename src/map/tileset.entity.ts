import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";

@Entity()
export default class Tileset {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	name: string;

	constructor(name: string) {
		this.name = name;
	}
}