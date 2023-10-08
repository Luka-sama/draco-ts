import assert from "assert/strict";
import _ from "lodash";
import MapUtil from "../util/map-util.js";
import {Vec2} from "../util/vector.js";
import Collection from "./collection.js";
import DB from "./db.js";
import Entity from "./entity.js";
import {ModelMap} from "./orm.decorator.js";
import {ChangeSet, ChangeType, EntityClass, EntityData, IEntity} from "./orm.typings.js";

export default class ORM {
	/** Flushes all entity changes to the database at least every .. ms */
	public static readonly FLUSH_FREQUENCY = 100;
	public static cachedEntries = new Map<EntityClass, Map<number, Entity>>;

	private static toInsertFlush = new Set<Entity>;
	private static toDeleteFlush = new Set<Entity>;
	private static toUpdateFlush = new Map<Entity, Set<string>>;

	private static shouldSync = false;
	private static changeSets: ChangeSet[] = [];
	private static toUpdateSync = new Map<Entity, Set<string>>;

	/** Clears cache and flush/sync queue */
	static clear(): void {
		ORM.cachedEntries.clear();
		ORM.toInsertFlush.clear();
		ORM.toDeleteFlush.clear();
		ORM.toUpdateFlush.clear();
		ORM.toUpdateSync.clear();
		ORM.changeSets.length = 0;
	}

	static enableSync(): void {
		ORM.shouldSync = true;
	}

	static disableSync(): void {
		ORM.shouldSync = false;
		ORM.toUpdateSync.clear();
		ORM.changeSets.length = 0;
	}

	/** Executes any raw SQL query, maps result to entity instances and populates them */
	static async getByQuery<T extends EntityClass>(entityClass: T, queryText: string): Promise<T[]> {
		const result = await DB.query(queryText);
		const entities = result.rows.map(raw => ORM.map(entityClass, raw));
		await Promise.all(entities.map(entity => ORM.populate(entity)));
		return entities;
	}

	/** Creates an entity instance and maps raw data to them */
	static map<T extends EntityClass>(entityClass: T, raw: EntityData): T {
		const entity = new entityClass(raw.id) as any;
		if (entity.isInitialized()) {
			return entity;
		}
		return ORM.mapEntity(entity, raw) as any;
	}

	/** Maps raw data to an already created entity instance */
	static mapEntity<T extends IEntity>(entity: any, raw: EntityData): InstanceType<T> {
		const model = ModelMap.get(entity.constructor as typeof Entity);
		assert(model);
		let populated = true;

		for (const [property, options] of model) {
			let dbProperty = _.snakeCase(property);
			if (options.vector) {
				dbProperty = (dbProperty == "position" ? "" : `${dbProperty}_`);
				entity[property] = Vec2(raw[`${dbProperty}x`], raw[`${dbProperty}y`]);
			} else if (options.manyToOne) {
				dbProperty += "_id";
				if (raw[dbProperty]) {
					populated = false;
					const referenceClass = (typeof options.manyToOne == "function" ? (options.manyToOne as any)() : options.manyToOne);
					entity[property] = new referenceClass(raw[dbProperty]);
				} else {
					entity[property] = null;
				}
			} else if (options.oneToMany) {
				populated = false;
				entity[property] = new Collection(entity, options.oneToMany[1]);
			} else if (raw[dbProperty] !== undefined) {
				entity[property] = raw[dbProperty];
			}
		}

		entity.__helper.initialized = true;
		entity.__helper.populated = populated;
		return entity;
	}

	/** Searches for entities of certain class by ID (i.e. a number) or condition string (e.g. "x=3 AND y=4") */
	static async find<T extends IEntity>(entityClass: T, where?: number | string): Promise<InstanceType<T>[]> {
		const model = _.snakeCase(entityClass.name);
		let queryText = `SELECT * FROM "${model}"`;
		if (where) {
			queryText += " WHERE " + (typeof where == "number" ? `id=${where}` : where);
		}
		return await ORM.getByQuery(entityClass as any, queryText) as any;
	}

	/** Returns an entity only if it is cached */
	static getIfCached<T extends IEntity>(entityClass: any, id: number): InstanceType<T> | null {
		const entries = MapUtil.getMap(ORM.cachedEntries, entityClass);
		if (entries.has(id)) {
			return entries.get(id) as any;
		}
		return null;
	}

	/**
	 * Searches for an entity of certain class by ID (i.e. a number) or condition string (e.g. "x=3 AND y=4").
	 * When searching by ID, it tries the cache before executing the query.
	 * Throws an exception in the case when there are two or more objects found.
	 */
	static async findOne<T extends IEntity>(entityClass: T, where?: number | string): Promise<InstanceType<T> | null> {
		const tryCache = (typeof where == "number" ? ORM.getIfCached(entityClass, where) : null);
		if (tryCache && tryCache.isInitialized()) {
			return tryCache as any;
		}
		const objects = await ORM.find(entityClass, where);
		assert(objects.length <= 1);
		return (objects.length > 0 ? objects[0] as InstanceType<T> : null);
	}

	/**
	 * Searches for an entity of certain class by ID (i.e. a number) or condition string (e.g. "x=3 AND y=4").
	 * When searching by ID, it tries the cache before executing the query.
	 * Throws an exception if not exactly one object was found (i.e. zero, two or more).
	 */
	static async findOneOrFail<T extends IEntity>(entityClass: T, where?: number | string): Promise<InstanceType<T>> {
		const result = await ORM.findOne(entityClass, where);
		assert(result != null);
		return result as InstanceType<T>;
	}

	static async populate(entity: any): Promise<void> {
		if (entity.__helper.populated) {
			return;
		}
		const model = ModelMap.get((entity as any).constructor);
		assert(model);

		for (const [property, options] of model) {
			if (options.manyToOne) {
				const reference = entity[property];
				if (reference && reference.id && !reference.isInitialized()) {
					await ORM.findOne(reference.constructor, reference.id);
				}
			} else if (options.oneToMany && !entity[property].isInitialized()) {
				const [referenceClass, foreignKey] = options.oneToMany;
				const entities = await ORM.find(referenceClass, `${_.snakeCase(foreignKey)}_id=${entity.id}`);
				entity[property].addEntities(entities);
				entity[property].__helper.initialized = true;
			}
		}

		entity.__helper.populated = true;
	}

	static createChangeSet(entity: Entity, type: ChangeType, payload: EntityData = {}): void {
		if (ORM.shouldSync) {
			ORM.changeSets.push({entity, type, payload});
		}
	}

	static sync(): ChangeSet[] {
		for (const [entity, entityChanges] of ORM.toUpdateSync) {
			const payload = _.pick(entity, Array.from(entityChanges));
			ORM.createChangeSet(entity, ChangeType.Update, payload);
		}

		const changeSets = ORM.changeSets;
		ORM.changeSets = [];
		ORM.toUpdateSync = new Map;
		return changeSets;
	}

	static async flush(): Promise<void> {
		const toInsert = ORM.toInsertFlush;
		ORM.toInsertFlush = new Set;
		for (const entity of toInsert) {
			const model = _.snakeCase(entity.constructor.name);
			const [queryPart, values] = ORM.toSetQuery(entity, true);
			const result = await DB.query(`INSERT INTO "${model}" ${queryPart} RETURNING id`, values);
			entity.id = result.rows[0].id;
			entity.__helper.notCreated = false;
			const entries = ORM.cachedEntries.get(entity.constructor as typeof Entity);
			if (entries) { // why???????
				entries.set(entity.id, entity);
			}
			await ORM.populate(entity);
		}

		const toUpdate = ORM.toUpdateFlush;
		ORM.toUpdateFlush = new Map;
		const queries = [];
		for (const [entity, entityChanges] of toUpdate) {
			const [queryPart, values] = ORM.toSetQuery(entity, false, entityChanges);
			if (!queryPart || entity.isRemoved()) {
				continue;
			}
			values.push(entity.id);
			const modelName = _.snakeCase(entity.constructor.name);
			queries.push(DB.query(`UPDATE "${modelName}" SET ${queryPart} WHERE id = $${values.length}`, values));
		}
		await Promise.all(queries);

		const toDelete = ORM.toDeleteFlush;
		ORM.toDeleteFlush = new Set;
		for (const entity of toDelete) {
			const model = _.snakeCase(entity.constructor.name);
			await DB.query(`DELETE FROM ${model} WHERE id=$1`, [entity.id]);
		}
	}

	static insert(entity: Entity): void {
		ORM.toInsertFlush.add(entity);
		ORM.createChangeSet(entity, ChangeType.Create);
	}

	static update(entity: Entity, property: string): void {
		const model = ModelMap.get(entity.constructor as typeof Entity);
		if (!model) { // || !model.has(property)
			return;
		}
		MapUtil.getSet(ORM.toUpdateFlush, entity).add(property);
		if (ORM.shouldSync) {
			MapUtil.getSet(ORM.toUpdateSync, entity).add(property);
		}
	}

	static remove(entity: Entity): void {
		entity.__helper.removed = true;
		ORM.toDeleteFlush.add(entity);
		ORM.createChangeSet(entity, ChangeType.Delete);
		MapUtil.getMap(ORM.cachedEntries, entity.constructor).delete(entity.id);
	}

	private static toSetQuery(entity: any, insert = false, properties?: Set<string> | IterableIterator<string>): [queryPart: string, values: any[]] {
		const model = ModelMap.get(entity.constructor as any);
		assert(model);
		const placeholders: string[] = [];
		const fields: string[] = [];
		const values: any[] = [];
		properties = properties || model.keys();

		for (const property of properties) {
			const options = model.get(property);
			if (property == "id" || !options) {
				continue;
			}
			let dbProperty = _.snakeCase(property);
			const value = entity[property];
			if (options.vector) {
				dbProperty = (dbProperty == "position" ? "" : `${dbProperty}_`);
				values.push(value.x);
				fields.push(`${dbProperty}x`);
				placeholders.push(`$${values.length}`);
				values.push(value.y);
				fields.push(`${dbProperty}y`);
				placeholders.push(`$${values.length}`);
			} else if (options.manyToOne) {
				dbProperty += "_id";
				values.push(value ? value.id : value);
				fields.push(`${dbProperty}`);
				placeholders.push(`$${values.length}`);
			} else if (!options.oneToMany) {
				values.push(value);
				fields.push(`${dbProperty}`);
				placeholders.push(`$${values.length}`);
			}
		}

		const queryPart = (insert ?
			`(${fields.join(", ")}) VALUES (${placeholders.join(", ")})` :
			fields.map((field, i) => `${field}=${placeholders[i]}`).join(", ")
		);

		return [queryPart, values];
	}
}