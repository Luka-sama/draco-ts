import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {IsEmail, Length, Matches} from "class-validator";

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
	@Matches(/[a-z0-9-]/i)
	name: string;

	@Unique()
	@Property()
	@IsEmail()
	email: string;

	@Property()
	@Length(8, 32)
	pass: string;

	@Property()
	salt: string;

	@Property()
	regDate = new Date();

	constructor(name: string, email: string, pass: string) {
		this.name = name;
		this.email = email;
		this.pass = pass;
		this.salt = "";
	}
}