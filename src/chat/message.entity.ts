import User from "../auth/user.entity.js";
import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";
import {Sync} from "../draco-ts/sync/sync.decorator.js";
import {Vector2} from "../draco-ts/util/vector.js";
import {RoundArea} from "../map/area.js";
import Location from "../map/location.entity.js";
import Chat from "./chat.js";

function getDeleteIn(date: Date): number {
	return Math.max(0, Chat.DELETE_MESSAGE_AFTER - (Date.now() - date.getTime()));
}

/** Chat message class */
export default class Message extends Entity {
	@Property()
	id!: number;

	@Property()
	@Sync({for: RoundArea})
	text!: string;

	@Property({manyToOne: () => User})
	@Sync({for: RoundArea, map: "name"})
	user!: User;

	@Property()
	@Sync({for: RoundArea, as: "deleteIn", map: getDeleteIn})
	date = new Date();

	@Property({manyToOne: () => Location})
	location!: Location;

	@Property({vector: true})
	position!: Vector2;

	getAreaParams(): ConstructorParameters<typeof RoundArea> {
		return [this.location, this.position, Chat.HEARING_RADIUS];
	}
}