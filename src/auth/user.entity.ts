import {Embedded, Entity, ManyToOne, Property, Unique} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity";
import Sync from "../core/sync.decorator";
import {SyncFor} from "../core/sync.typings";
import {Emitter, Socket, UserData} from "../core/ws.typings";
import Location from "../map/location.entity";
import {Vector2} from "../math/vector.embeddable";
import Account from "./account.entity";

/**
 * User entity
 *
 * Every {@link Account | account} can have multiple users.
 */
@Entity()
export default class User extends WeakCachedEntity implements Emitter {
	@Unique()
	@Property()
	@Sync({for: SyncFor.Zone})
	name: string;

	@ManyToOne()
	account: Account;

	@Property()
	regDate = new Date();

	@ManyToOne()
	location: Location;

	@Embedded({prefix: false})
	@Sync({for: SyncFor.Zone})
	position: Vector2;

	socket?: Socket;

	connected = false;

	constructor(name: string, account: Account, location: Location, position: Vector2, id = 0) {
		super(id);
		this.name = name;
		this.account = account;
		this.location = location;
		this.position = position;
		return this.getInstance();
	}

	emit(event: string, data?: UserData): void {
		if (this.socket) {
			this.socket.emit(event, data);
		} else if (process.env.WS_DEBUG == "true") {
			console.log(`User ${this.name} (ID=${this.id}) has no socket for event=${event} with data=${JSON.stringify(data)}`);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}
}