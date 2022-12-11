import {Embedded, Entity, Index, ManyToOne, PrimaryKey, Property} from "@mikro-orm/core";
import User from "../auth/user.entity";
import {Sync} from "../core/sync.decorator";
import {RoundArea} from "../map/area";
import Location from "../map/location.entity";
import {Vector2} from "../math/vector.embeddable";
import Chat from "./chat";

function getDeleteIn(date: Date): number {
	return Math.max(0, Chat.DELETE_AFTER_MS - (Date.now() - date.getTime()));
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
		return [this.location, this.position, Chat.HEARING_RADIUS];
	}
}