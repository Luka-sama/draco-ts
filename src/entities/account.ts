import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";

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
	name: string;

	@Unique()
	@Property()
	email: string;

	@Property()
	pass: string;

	@Property()
	regDate = new Date();

	constructor(name: string, email: string, pass: string) {
		this.name = name;
		this.email = email;
		this.pass = pass;
	}
}