import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";
import {Rel} from "../draco-ts/orm/orm.typings.js";
import {Vector2} from "../draco-ts/util/vector.js";
import LightsGroup from "./lights-group.entity.js";

/** Item shape entity */
export default class Light extends Entity {
	@Property()
	id!: number;

	@Property({manyToOne: () => LightsGroup})
	lightsGroup!: Rel<LightsGroup>;

	@Property({vector: true})
	position!: Vector2;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}