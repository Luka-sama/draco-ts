import {Sync} from "../core/sync.decorator.js";
import {SyncFor} from "../core/sync.typings.js";
import {Receiver, Socket, UserData} from "../core/ws.typings.js";
import Item from "../item/item.entity.js";
import LightsGroup from "../magic/lights-group.entity.js";
import Location from "../map/location.entity.js";
import Collection from "../orm/collection.js";
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";
import Const from "../util/const.js";
import {Vector2} from "../util/vector.js";
import Account from "./account.entity.js";

/**
 * User entity
 *
 * Every {@link Account | account} can have multiple users.
 */
export default class User extends Entity implements Receiver {
	@Property()
	id!: number;

	@Property()
	@Sync(SyncFor.Zone)
	name!: string;

	@Property({manyToOne: () => Account})
	account!: Account;

	@Property()
	regDate = new Date();

	@Property({manyToOne: () => Location})
	location!: Location;

	@Property({vector: true})
	@Sync(SyncFor.Zone)
	position!: Vector2;

	@Sync(SyncFor.Zone)
	speed = Const.MOVEMENT_WALK_SPEED;

	@Property({oneToMany: [Item, "holder"]})
	items!: Collection<Item>;

	@Property({oneToMany: [LightsGroup, "targetMage"]})
	lightsGroups!: Collection<LightsGroup>;

	socket?: Socket;

	connected = false;

	hadFirstSync = false;

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