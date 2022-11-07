import {AnyEntity} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity";

export default class ZoneEntities {
	User: Set<User> = new Set();

	getModels(): string[] {
		return Object.keys(this);
	}

	get(model: string): Set<User> {
		const set = this[model as keyof ZoneEntities];
		assert(set instanceof Set);
		return set;
	}

	enter(entity: AnyEntity): void {
		const set = this.get(entity.constructor.name);
		set.add(entity as any);
	}

	delete(entity: AnyEntity): void {
		const set = this.get(entity.constructor.name);
		set.delete(entity as any);
	}

	merge(otherEntities: ZoneEntities): void {
		for (const model of this.getModels()) {
			const sourceSet = otherEntities.get(model);
			const destSet = this.get(model);
			sourceSet.forEach(destSet.add, destSet);
		}
	}
}