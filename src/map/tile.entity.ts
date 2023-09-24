import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";
import {Sync} from "../draco-ts/sync/sync.decorator.js";
import {SyncFor} from "../draco-ts/sync/sync.typings.js";
import {Vector2} from "../draco-ts/util/vector.js";
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

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}