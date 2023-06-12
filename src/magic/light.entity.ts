import {Embedded, Entity, ManyToOne, Rel, Unique} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Vector2} from "../util/vector.embeddable.js";
import LightsGroup from "./lights-group.entity.js";

/** Item shape entity */
@Entity()
@Unique({properties: ["lightsGroup", "x", "y"]})
export default class Light extends WeakCachedEntity {
	@ManyToOne()
	lightsGroup: Rel<LightsGroup>;

	@Embedded({prefix: false})
	position: Vector2;

	constructor(lightsGroup: Rel<LightsGroup>, position: Vector2, id = 0) {
		super(id);
		this.lightsGroup = lightsGroup;
		this.position = position;
		return this.getInstance();
	}
}