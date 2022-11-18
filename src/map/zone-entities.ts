import {AnyEntity} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity";

/** Data storage class that stores all entities in a zone or a subzone (user, items etc) */
export default class ZoneEntities {
	User: Set<User> = new Set();

	/** Returns all models that are here stored */
	static getModels(): string[] {
		return Object.keys(new ZoneEntities);
	}

	/** Returns entity set for the given model */
	get(model: string): Set<AnyEntity> {
		const set = this[model as keyof ZoneEntities];
		assert(set instanceof Set);
		return set;
	}

	/** Adds an entity to the set for its model */
	enter(entity: AnyEntity): void {
		const set = this.get(entity.constructor.name);
		set.add(entity as any);
	}

	/** Removes an entity from the set for its model */
	delete(entity: AnyEntity): void {
		const set = this.get(entity.constructor.name);
		set.delete(entity as any);
	}

	/** Merges other entities into this */
	merge(otherEntities: ZoneEntities): void {
		for (const model in this) {
			const sourceSet = otherEntities.get(model);
			const destSet = this.get(model);
			sourceSet.forEach(destSet.add, destSet);
		}
	}
}