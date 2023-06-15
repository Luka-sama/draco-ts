import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import {Vector2} from "../util/vector.js";
import Location from "./location.entity.js";
import Tileset from "./tileset.entity.js";

/**
 * Tile entity
 *
 * Describes single tile (where do you need to take the image with this tile from).
 */
export default class Tile extends Entity {
	@Property()
	id!: number;

	@Property({manyToOne: () => Location})
	location!: Location;

	@Property({vector: true})
	@Sync({for: SyncFor.Zone, as: "p"})
	position!: Vector2;

	@Property({manyToOne: () => Tileset})
	@Sync({for: SyncFor.Zone, map: "name", as: "t"})
	tileset!: Tileset;

	@Property({vector: true})
	@Sync({for: SyncFor.Zone, as: "a"})
	atlasCoords!: Vector2;
}