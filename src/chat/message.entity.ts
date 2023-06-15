import User from "../auth/user.entity.js";
import {Sync} from "../core/sync.decorator.js";
import {RoundArea} from "../map/area.js";
import Location from "../map/location.entity.js";
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import Const from "../util/const.js";
import {Vector2} from "../util/vector.js";

function getDeleteIn(date: Date): number {
	return Math.max(0, Const.CHAT_DELETE_MESSAGE_AFTER_MS - (Date.now() - date.getTime()));
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
		return [this.location, this.position, Const.CHAT_HEARING_RADIUS];
	}
}