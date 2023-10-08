import Collection from "../draco-ts/orm/collection.js";
import Entity from "../draco-ts/orm/entity.js";
import {Property} from "../draco-ts/orm/orm.decorator.js";
import {Sync} from "../draco-ts/sync/sync.decorator.js";
import {SyncFor} from "../draco-ts/sync/sync.typings.js";
import {UserData} from "../draco-ts/util/validation.js";
import {Vector2} from "../draco-ts/util/vector.js";
import WS, {Receiver} from "../draco-ts/ws.js";
import Item from "../item/item.entity.js";
import LightsGroup from "../magic/lights-group.entity.js";
import Location from "../map/location.entity.js";
import Movement from "../map/movement.js";
import Account from "./account.entity.js";
import Session from "./session.js";

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
	speed = Movement.WALK_SPEED;

	@Property({oneToMany: [Item, "holder"]})
	items!: Collection<Item>;

	@Property({oneToMany: [LightsGroup, "targetMage"]})
	lightsGroups!: Collection<LightsGroup>;

	pigeonHits = 0;

	hadFirstSync = false;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}

	emit(event: string, data?: UserData): void {
		const sockets = Session.getSocketsByUser(this);
		if (sockets.size > 0) {
			sockets.forEach(socket => socket.emit(event, data));
		} else {
			WS.logger.debug(`User ${this.name} (ID=${this.id}) has no socket for event=${event} with data=${JSON.stringify(data)}`);
		}
	}

	info(text: string): void {
		this.emit("info", {text});
	}
}