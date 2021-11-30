import {Entity, ManyToOne, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import {Matches} from "class-validator";
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
	@Matches(/[A-Z][a-z]*/)
	name: string;

	@ManyToOne()
	account: Account;

	constructor(name: string, account: Account) {
		this.name = name;
		this.account = account;
	}
}