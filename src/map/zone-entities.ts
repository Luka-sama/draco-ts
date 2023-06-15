import assert from "assert/strict";
import User from "../auth/user.entity.js";
import Item from "../item/item.entity.js";
import LightsGroup from "../magic/lights-group.entity.js";
import Entity from "../orm/entity.js";
import {EntityClass, IEntity} from "../orm/orm.typings.js";
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
	private models = new Map<EntityClass, Set<Entity>>;

	public static getEntitiesInfo(): Map<any, EntityInfo> {
		return new Map<any, EntityInfo>([
			[Tile, {}],
			[User, {}],
			[Item, {table: "item", partTable: "item_shape_part", foreignKey: "type_id"}],
			[LightsGroup, {table: "lights_group", partTable: "light", foreignKey: "id", partForeignKey: "lights_group_id"}]
		]);
	}

	/** Returns all models that are here stored */
	public static getModels(): EntityClass[] {
		return Array.from(this.getEntitiesInfo().keys());
	}

	/** Returns entity set for the given model */
	get<T extends IEntity>(model: T): Set<InstanceType<T>> {
		const set = this.models.get(model as any);
		assert(set, `${model} does not exist in this zone entities`);
		return set as any;
	}

	/** Returns entity set for the given model */
	getFromMemory<T extends Entity>(model: EntityClass): Set<T> {
		const set = this.models.get(model);
		return (set || new Set) as Set<T>;
	}

	set(model: EntityClass, data: Set<Entity> | Entity[]): void {
		if (data instanceof Array) {
			data = new Set(data);
		}
		this.models.set(model, data);
	}

	/** Adds an entity to the set for its model */
	enter(entity: Entity): void {
		const set = this.get((entity as any).constructor);
		set.add(entity);
	}

	/** Removes an entity from the set for its model */
	delete(entity: Entity): void {
		const set = this.get((entity as any).constructor);
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