import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import Tileset from "./tileset.entity";

@Entity()
@Unique({name: "tile_properties", properties: ["tileset", "tile", "subtileX", "subtileY"]})
export default class Tile {
	@PrimaryKey()
	id!: number;

	@Property()
	tileset: Tileset;

	@Property()
	tile: number;

	@Property()
	subtileX: number;

	@Property()
	subtileY: number;

	constructor(tileset: Tileset, tile: number, subtileX: number, subtileY: number) {
		this.tileset = tileset;
		this.tile = tile;
		this.subtileX = subtileX;
		this.subtileY = subtileY;
	}
}