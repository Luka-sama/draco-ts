import {Entity, ManyToOne, PrimaryKey, Property} from "@mikro-orm/core";
import Location from "./location.entity";
import Tile from "./tile.entity";

@Entity()
export default class TileMap {
	@PrimaryKey()
	id!: number;

	@ManyToOne()
	location: Location;

	@Property()
	x: number;

	@Property()
	y: number;

	@ManyToOne()
	tile: Tile;

	constructor(location: Location, x: number, y: number, tile: Tile) {
		this.location = location;
		this.x = x;
		this.y = y;
		this.tile = tile;
	}
}