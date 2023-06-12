import {Collection, Embedded, Entity, ManyToOne, OneToMany, Property, Unique} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity.js";
import {Sync} from "../core/sync.decorator.js";
import {syncTrack} from "../core/sync.js";
import {SyncFor} from "../core/sync.typings.js";
import {Emitter, Socket, UserData} from "../core/ws.typings.js";
import Item from "../item/item.entity.js";
import Location from "../map/location.entity.js";
import Const from "../util/const.js";
import {Vector2} from "../util/vector.embeddable.js";
import Account from "./account.entity.js";

/**
 * User entity
 *
 * Every {@link Account | account} can have multiple users.
 */
@Entity()
export default class User extends WeakCachedEntity implements Emitter {
	@Unique()
	@Property()
	@Sync(SyncFor.Zone)
	name: string;

	@ManyToOne()
	account: Account;

	@Property()
	regDate = new Date();

	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	@Sync(SyncFor.Zone)
	position: Vector2;

	@Sync(SyncFor.Zone)
	speed = Const.MOVEMENT_WALK_SPEED;

	@OneToMany({mappedBy: (item: Item) => item.holder})
	items = new Collection<Item>(this);

	socket?: Socket;

	connected = false;

	hadFirstSync = false;

	constructor(name: string, account: Account, location: Location, position: Vector2, id = 0) {
		super(id);
		this.name = name;
		this.account = account;
		this.location = location;
		this.position = position;
		return syncTrack(this.getInstance());
	}

	emit(event: string, data?: UserData): void {
		if (this.socket) {
			this.socket.emit(event, data);
		} else if (process.env.WS_DEBUG == "verbose") {
			console.log(`User ${this.name} (ID=${this.id}) has no socket for event=${event} with data=${JSON.stringify(data)}`);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}
}