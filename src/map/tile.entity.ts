import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import TileSet from "./tile-set.entity";

@Entity()
@Unique({name: "tile_properties", properties: ["tileSet", "tile", "subtileX", "subtileY"]})
export default class Tile {
	@PrimaryKey()
	id!: number;

	@Property()
	tileSet: TileSet;

	@Property()
	tile: number;

	@Property()
	subtileX: number;

	@Property()
	subtileY: number;

	constructor(tileSet: TileSet, tile: number, subtileX: number, subtileY: number) {
		this.tileSet = tileSet;
		this.tile = tile;
		this.subtileX = subtileX;
		this.subtileY = subtileY;
	}
}