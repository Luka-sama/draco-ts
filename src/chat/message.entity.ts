import {Embedded, Entity, Index, ManyToOne, PrimaryKey, Property} from "@mikro-orm/core";
import User from "../auth/user.entity";
import Sync from "../core/sync.decorator";
import {SyncFor} from "../core/sync.typings";
import Location from "../map/location.entity";
import {Vector2} from "../math/vector.embeddable";

/** Chat message class */
@Entity()
export default class Message {
	@PrimaryKey()
	id!: number;

	@Property()
	@Sync({for: SyncFor.Zone})
	text: string;

	@ManyToOne()
	@Sync({for: SyncFor.Zone, map: "name"})
	user: User;

	@Property()
	@Index()
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
}