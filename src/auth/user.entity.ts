import {Entity, ManyToOne, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {Matches} from "class-validator";
import Cache from "../cache";
import Location from "../map/location.entity";
import {tr} from "../util";
import {Vec2, Vector2} from "../vector";
import {EM, Socket, UserData} from "../ws";
import Account from "./account.entity";

/**
 * User entity. Every {@link Account | account} can have multiple users
 *
 * @category Entity
 */
@Entity()
export default class User {
	// Main properties
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	@Matches(/^[A-Z][a-z]*$/, {message: tr("USER_NAME_FORMAT_WRONG")})
	name: string;

	@ManyToOne()
	account: Account;

	@Property({nullable: true})
	regDate = new Date();

	// Map
	@ManyToOne({nullable: true})
	location: Location;

	@Property({nullable: true})
	x: number;

	@Property({nullable: true})
	y: number;

	get position() {
		return Vec2(this.x, this.y);
	}

	set position(v: Vector2) {
		this.x = v.x;
		this.y = v.y;
	}

	// Other
	socket?: Socket;

	constructor(name: string, account: Account, location: Location, x: number, y: number) {
		this.name = name;
		this.account = account;
		this.location = location;
		this.x = x;
		this.y = y;
	}

	emit(event: string, data?: UserData) {
		if (this.socket) {
			this.socket.emit(event, data);
		} else if (process.env.WS_DEBUG == "true") {
			console.log(`User ${this.name} (ID=${this.id}) has no socket for event=${event} with data=${JSON.stringify(data)}`);
		}
	}

	info(text: string) {
		this.emit("info", {text});
	}

	static async get(em: EM, id: number) {
		return await Cache.getOrSet(`user/${id}`, async () => await em.findOne(User, {id}));
	}
}