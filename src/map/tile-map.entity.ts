import {Embedded, Entity, ManyToOne, PrimaryKey} from "@mikro-orm/core";
import {Vector2} from "../vector.embeddable";
import Location from "./location.entity";
import Tile from "./tile.entity";

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