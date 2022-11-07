import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {IsEmail, Length, Matches} from "class-validator";
import {WeakCachedEntity} from "../cache/cached-entity";
import {tr} from "../core/util";

/** Account entity */
@Entity()
export default class Account extends WeakCachedEntity {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	@Matches(/^[a-z0-9-]+$/i, {message: tr("ACCOUNT_NAME_FORMAT_WRONG")})
	name: string;

	@Unique()
	@Property()
	@IsEmail({}, {message: tr("MAIL_FORMAT_WRONG")})
	mail: string;

	@Property()
	@Length(8, 32, {message: tr("PASS_LENGTH_WRONG")})
	pass: string;

	@Property()
	salt: string;

	@Property()
	regDate = new Date();

	@Unique()
	@Property()
	token: string;

	constructor(name: string, mail: string, pass: string, token: string, id = 0) {
		super(id);
		this.name = name;
		this.mail = mail;
		this.pass = pass;
		this.salt = "";
		this.token = token;
		return this.getInstance();
	}
}