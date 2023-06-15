import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import {Rel} from "../orm/orm.typings.js";
import {Vector2} from "../util/vector.js";
import LightsGroup from "./lights-group.entity.js";

/** Item shape entity */
export default class Light extends Entity {
	@Property()
	id!: number;

	@Property({manyToOne: () => LightsGroup})
	lightsGroup!: Rel<LightsGroup>;

	@Property({vector: true})
	position!: Vector2;
}