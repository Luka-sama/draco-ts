import {Embedded, Entity, ManyToOne, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {Matches} from "class-validator";
import {WeakCachedEntity} from "../cache/cached-entity";
import Location from "../map/location.entity";
import {Vector2} from "../math/vector.embeddable";
import Sync from "../sync/sync.decorator";
import {SyncFor} from "../sync/sync.typings";
import {tr} from "../util";
import {Emitter, Socket, UserData} from "../ws.typings";
import Account from "./account.entity";

/**
 * User entity
 *
 * Every {@link Account | account} can have multiple users.
 * @category Entity
 */
@Entity()
export default class User extends WeakCachedEntity implements Emitter {
	// Main properties
	@PrimaryKey()
	@Sync()
	id!: number;

	@Unique()
	@Property()
	@Matches(/^[A-Z][a-z]*$/, {message: tr("USER_NAME_FORMAT_WRONG")})
	@Sync({for: SyncFor.Zone})
	name: string;

	@ManyToOne()
	account: Account;

	@Property({nullable: true})
	regDate = new Date();

	// Map
	@ManyToOne({nullable: true})
	location: Location;

	@Embedded({nullable: true, prefix: false})
	@Sync({for: SyncFor.Zone})
	position: Vector2;

	// Other
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