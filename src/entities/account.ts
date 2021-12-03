import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {IsEmail, Length, Matches} from "class-validator";
import {randomBytes} from "crypto";
import {promisify} from "util";

/**
 * Account entity
 *
 * @category Entity
 */
@Entity()
export default class Account {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	@Matches(/^[a-z0-9-]+$/i, {message: "ACCOUNT_NAME_FORMAT_WRONG"})
	name: string;

	@Unique()
	@Property()
	@IsEmail({}, {message: "MAIL_FORMAT_WRONG"})
	mail: string;

	@Property()
	@Length(8, 32, {message: "PASS_LENGTH_WRONG"})
	pass: string;

	@Property()
	salt: string;

	@Property()
	regDate = new Date();

	@Unique()
	@Property()
	token!: string;

	constructor(name: string, mail: string, pass: string) {
		this.name = name;
		this.mail = mail;
		this.pass = pass;
		this.salt = "";
	}

	async generateToken() {
		this.token = (await promisify(randomBytes)(48)).toString("hex");
	}
}