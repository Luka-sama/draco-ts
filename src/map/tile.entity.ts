import {Embedded, Entity, ManyToOne} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import {Vector2} from "../util/vector.embeddable.js";
import Location from "./location.entity.js";
import Tileset from "./tileset.entity.js";

/**
 * Tile entity
 *
 * Describes single tile (where do you need to take the image with this tile from).
 */
@Entity()
export default class Tile extends WeakCachedEntity {
	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	@Sync({for: SyncFor.Zone, as: "p"})
	position: Vector2;

	@ManyToOne()
	@Sync({for: SyncFor.Zone, map: "name", as: "t"})
	tileset: Tileset;

	@Embedded()
	@Sync({for: SyncFor.Zone, as: "a"})
	atlasCoords: Vector2;

	constructor(location: Location, position: Vector2, tileset: Tileset, atlasCoords: Vector2, id = 0) {
		super(id);
		this.location = location;
		this.position = position;
		this.tileset = tileset;
		this.atlasCoords = atlasCoords;
		return this.getInstance();
	}
}