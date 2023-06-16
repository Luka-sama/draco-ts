/** Account entity */
import Entity from "../orm/entity.js";
import {Property} from "../orm/orm.decorator.js";

export default class Account extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;

	@Property()
	mail!: string;

	@Property()
	pass!: string;

	@Property()
	salt = "";

	@Property()
	regDate = new Date();

	/** Authorization token with which the user can sign in */
	@Property()
	token!: string;

	constructor(id: number) {
		super(id);
		return this.getInstance();
	}
}