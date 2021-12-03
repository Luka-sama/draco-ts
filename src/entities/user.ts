import {Entity, ManyToOne, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {Matches} from "class-validator";
import {randomBytes} from "crypto";
import {promisify} from "util";
import {Socket, UserData} from "../ws";
import Account from "./account";

/**
 * User entity. Every {@link Account | account} can have multiple users
 *
 * @category Entity
 */
@Entity()
export default class User {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	@Matches(/^[A-Z][a-z]*$/, {message: "USER_NAME_FORMAT_WRONG"})
	name: string;

	@ManyToOne()
	account: Account;

	@Unique()
	@Property()
	token!: string;

	socket?: Socket;

	constructor(name: string, account: Account) {
		this.name = name;
		this.account = account;
	}

	async generateToken() {
		this.token = (await promisify(randomBytes)(48)).toString("hex");
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
}