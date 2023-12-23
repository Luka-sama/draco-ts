import assert from "assert/strict";
import _ from "lodash";
import MapUtil from "../collection-utils/map-util.js";
import {ModelMap} from "./orm.decorator.js";
import ORM from "./orm.js";
import {EntityData, EntityHelper, IEntity} from "./orm.typings.js";

export type InMemory<T> = T;

export default class Entity {
	public static syncTracked = new Map<Entity, Set<string>>;
	public id: number;
	public __helper: EntityHelper = {initialized: false, populated: false, notCreated: false, removed: false};
	[key: string]: any;

	public static create<T extends IEntity>(this: T, params: {[key: string]: any}): InstanceType<T> {
		const entity = new this as InstanceType<T>;
		entity.__helper.notCreated = true;

		const model = ModelMap.get(entity.constructor as typeof Entity);
		assert(model);

		let addedParams = 0;
		const raw: EntityData = {};
		for (const [property, options] of model) {
			let dbProperty = _.snakeCase(property);
			if (property in params) {
				if (options.manyToOne) {
					dbProperty += "_id";
					raw[dbProperty] = params[property].id;
				} else if (options.vector) {
					dbProperty = (dbProperty == "position" ? "" : `${dbProperty}_`);
					raw[`${dbProperty}x`] = params[property].x;
					raw[`${dbProperty}y`] = params[property].y;
				} else {
					raw[dbProperty] = params[property];
				}
				addedParams++;
			} else if ((entity as any)[property] !== undefined) {
				raw[dbProperty] = (entity as any)[property];
			} else if (options.manyToOne) {
				dbProperty += "_id";
				raw[dbProperty] = 0;
			} else if (options.vector) {
				dbProperty = (dbProperty == "position" ? "" : `${dbProperty}_`);
				raw[`${dbProperty}x`] = 0;
				raw[`${dbProperty}y`] = 0;
			} else {
				raw[dbProperty] = undefined;
			}
		}
		assert(addedParams == Object.keys(params).length);

		ORM.mapEntity(entity as typeof Entity, raw);
		entity.create();
		return entity;
	}

	public static async get<T extends IEntity>(this: T, where: number | string): Promise<InstanceType<T> | null> {
		return await ORM.findOne(this, where) as any;
	}

	public static async getOrFail<T extends IEntity>(this: T, where: number | string): Promise<InstanceType<T>> {
		return await ORM.findOneOrFail(this, where) as any;
	}

	public static getIfCached<T extends IEntity>(this: T, id: number): InstanceType<T> | null {
		return ORM.getIfCached(this, id) as any;
	}

	constructor(id: number) {
		const proxied = new Proxy(this, {set: Entity.rememberChange}) as this;
		this.id = id;
		return proxied;
	}

	protected getInstance(): this {
		if (!this.id) {
			return this;
		}
		const cached = ORM.getIfCached(this.constructor, this.id);
		if (cached) {
			return cached as this;
		}
		//this.syncTrack();
		const entries = ORM.cachedEntries.get(this.constructor as typeof Entity)!;
		entries.set(this.id, this);
		return this;
	}

	public isInitialized() {
		return this.__helper.initialized;
	}

	public isPopulated() {
		return this.__helper.populated;
	}

	public isRemoved() {
		return this.__helper.removed;
	}

	public create(): void {
		ORM.insert(this);
	}

	public remove(): void {
		ORM.remove(this);
	}

	private static rememberChange(target: Entity, property: string | symbol, value: any, receiver: any): boolean {
		if ((target as any)[property] === value) {
			return true;
		}
		(target as any)[property] = value;
		if (typeof property == "string" && target.isInitialized() && property != "id") {
			if (value === null) {
				//console.trace(target.id, property);
			}
			ORM.update(receiver, property);
		}
		return true;
	}

	/**
	 * This function adds tracking for properties that should not be stored in the database.
	 * It should be called immediately after the constructor, preferably in the last line of the constructor.
	 * It returns the entity itself to simplify use with the CachedEntity.
	 *
	 * Call `syncTrack(this);` for simple entities and `return syncTrack(this.getInstance());` for cached entities.
	 *
	 * A limitation is that the position and location should be always stored in the database, otherwise the zone handling will not work.
	 */
	private syncTrack(): void {
		const model = this.constructor as typeof Entity;
		const syncProperties: string[] = [];
		const metadata = ModelMap.get(model);
		assert(metadata);
		const syncedProperties = syncProperties.filter(property => !metadata.has(property));
		for (const property of syncedProperties) {
			const isAlreadyTracked = !!Object.getOwnPropertyDescriptor(this, property)?.get;
			if (!isAlreadyTracked) {
				this.trackProperty(property);
			}
		}
	}

	// This code is separated into a separate function to avoid memory leaks (by minimizing the number of variables in the scope)
	private trackProperty(property: string): void {
		let value = this[property];
		Object.defineProperty(this, property, {
			get: () => value,
			set: (newValue) => {
				if (value !== newValue) {
					this.addTrackData(property);
					value = newValue;
				}
			}
		});
	}

	private addTrackData(property: string): void {
		const changedProperties = MapUtil.getSet(Entity.syncTracked, this);
		changedProperties.add(property);
	}
}