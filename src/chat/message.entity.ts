import {Embedded, Entity, Index, ManyToOne, PrimaryKey, Property} from "@mikro-orm/core";
import User from "../auth/user.entity";
import {Sync} from "../core/sync.decorator";
import {RoundArea} from "../map/area";
import Location from "../map/location.entity";
import Const from "../math/const";
import {Vector2} from "../math/vector.embeddable";

function getDeleteIn(date: Date): number {
	return Math.max(0, Const.CHAT_DELETE_MESSAGE_AFTER_MS - (Date.now() - date.getTime()));
}

/** Chat message class */
@Entity()
export default class Message {
	@PrimaryKey()
	id!: number;

	@Property()
	@Sync({for: RoundArea})
	text: string;

	@ManyToOne()
	@Sync({for: RoundArea, map: "name"})
	user: User;

	@Property()
	@Index()
	@Sync({for: RoundArea, as: "deleteIn", map: getDeleteIn})
	date = new Date();

	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	position: Vector2;

	constructor(text: string, user: User) {
		this.text = text;
		this.user = user;
		this.location = user.location;
		this.position = user.position;
	}

	getAreaParams(): ConstructorParameters<typeof RoundArea> {
		return [this.location, this.position, Const.CHAT_HEARING_RADIUS];
	}
}