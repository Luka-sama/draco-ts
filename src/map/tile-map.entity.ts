import {Embedded, Entity, ManyToOne, PrimaryKey} from "@mikro-orm/core";
import {Vector2} from "../math/vector.embeddable.js";
import Location from "./location.entity.js";
import Tile from "./tile.entity.js";

/**
 * Tilemap entity
 *
 * Describes which tiles the location consists of.
 */
@Entity()
export default class TileMap {
	@PrimaryKey()
	id!: number;

	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	position: Vector2;

	@ManyToOne()
	tile: Tile;

	constructor(location: Location, position: Vector2, tile: Tile) {
		this.location = location;
		this.position = position;
		this.tile = tile;
	}
}