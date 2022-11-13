import {Entity, Property, Unique} from "@mikro-orm/core";
import {WeakCachedEntity} from "../cache/cached-entity";

/** Account entity */
@Entity()
export default class Account extends WeakCachedEntity {
	@Unique()
	@Property()
	name: string;

	@Unique()
	@Property()
	mail: string;

	@Property()
	pass: string;

	@Property()
	salt: string;

	@Property()
	regDate = new Date();

	/** Authorization token with which the user can sign in */
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