import {Embedded, Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {Vector2} from "../math/vector.embeddable.js";
import TileSet from "./tile-set.entity.js";

/**
 * Tile entity
 *
 * Describes single tile (where do you need to take the image with this tile from).
 */
@Entity()
@Unique({name: "tile_properties", properties: ["tileSet", "tile", "subtile_x", "subtile_y"]})
export default class Tile {
	@PrimaryKey()
	id!: number;

	@Property()
	tileSet: TileSet;

	@Property()
	tile: number;

	@Embedded()
	subtile: Vector2;

	constructor(tileSet: TileSet, tile: number, subtile: Vector2) {
		this.tileSet = tileSet;
		this.tile = tile;
		this.subtile = subtile;
	}
}