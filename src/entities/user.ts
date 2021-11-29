import {Entity, ManyToOne, PrimaryKey, Property, Unique} from "@mikro-orm/core";
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
	name: string;

	@ManyToOne()
	account: Account;

	constructor(name: string, account: Account) {
		this.name = name;
		this.account = account;
	}
}