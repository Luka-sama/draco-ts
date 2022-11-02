import {Entity, PrimaryKey, Property, Unique} from "@mikro-orm/core";
import User from "../auth/user.entity";
import {WeakCachedEntity} from "../cache/cached-entity";
import Sync from "../sync/sync.decorator";
import {UserData} from "../ws.typings";

/**
 * Location entity
 *
 * @category Entity
 */
@Entity()
export default class Location extends WeakCachedEntity {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	name: string;

	constructor(name: string, id = 0) {
		super(id);
		this.name = name;
		return this.getInstance();
	}
}