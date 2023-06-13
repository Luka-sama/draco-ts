import {AnyEntity, EntityClass} from "@mikro-orm/core";
import assert from "assert/strict";
import User from "../auth/user.entity.js";
import Item from "../item/item.entity.js";
import LightsGroup from "../magic/lights-group.entity.js";
import MapUtil from "../util/map-util.js";
import SetUtil from "../util/set-util.js";
import Tile from "./tile.entity.js";

/** Stores info only for shaped objects */
export type EntityInfo = {
	table: string;
	partTable: string;
	foreignKey: string;
	partForeignKey?: string;
} | {[K in string]: never};

/** Data storage class that stores all entities in a zone or a subzone (user, items etc) */
export default class ZoneEntities {
	private models = new Map<EntityClass<any>, Set<AnyEntity>>;

	public static getEntitiesInfo(): Map<EntityClass<any>, EntityInfo> {
		return new Map<EntityClass<any>, EntityInfo>([
			[Tile, {}],
			[User, {}],
			[Item, {table: "item", partTable: "item_shape_part", foreignKey: "type_id"}],
			[LightsGroup, {table: "lights_group", partTable: "light", foreignKey: "id", partForeignKey: "lights_group_id"}]
		]);
	}

	/** Returns all models that are here stored */
	public static getModels(): EntityClass<any>[] {
		return Array.from(this.getEntitiesInfo().keys());
	}

	/** Returns entity set for the given model */
	get<T extends AnyEntity>(model: EntityClass<T>): Set<T> {
		const set = this.models.get(model);
		assert(set, `${model} does not exist in this zone entities`);
		return set as Set<T>;
	}

	set(model: EntityClass<any>, data: Set<AnyEntity> | AnyEntity[]): void {
		if (data instanceof Array) {
			data = new Set(data);
		}
		this.models.set(model, data);
	}

	/** Adds an entity to the set for its model */
	enter(entity: AnyEntity): void {
		const set = this.get(entity.constructor);
		set.add(entity);
	}

	/** Removes an entity from the set for its model */
	delete(entity: AnyEntity): void {
		const set = this.get(entity.constructor);
		set.delete(entity);
	}

	/** Merges other entities into this */
	merge(otherEntities: ZoneEntities): void {
		for (const [model, sourceSet] of otherEntities.models) {
			const destSet = MapUtil.getSet(this.models, model);
			SetUtil.merge(destSet, sourceSet);
		}
	}

	difference(otherEntities: ZoneEntities): this {
		for (const [model, minuend] of this.models) {
			const subtrahend = otherEntities.models.get(model);
			if (subtrahend) {
				const newSet = SetUtil.difference(minuend, subtrahend);
				this.set(model, newSet);
			}
		}
		return this;
	}
}