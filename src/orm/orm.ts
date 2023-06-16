import assert from "assert/strict";
import _ from "lodash";
import pg, {QueryResult} from "pg";
import {SyncType} from "../core/sync.typings.js";
import MapUtil from "../util/map-util.js";
import {Vec2} from "../util/vector.js";
import Collection from "./collection.js";
import Entity from "./entity.js";
import {DB} from "./orm.decorator.js";
import {ChangeSet, EntityClass, EntityData, IEntity} from "./orm.typings.js";

export default class ORM {
	public static isSeeder = false;
	public static getChanges = (async (changeSets: ChangeSet[]): Promise<void> => undefined);
	private static pool: pg.Pool;
	public static cachedEntries = new Map<EntityClass, Map<number, Entity>>;
	private static toInsert = new Set<Entity>;
	private static toDelete = new Set<Entity>;
	private static toUpdate = new Map<EntityClass, Map<Entity, Set<string>>>;

	static init() {
		ORM.pool = new pg.Pool({
			user: "postgres",
			"password": "lT4z70kAnCi12tefd8EK",
			"database": "enveltia"
		});
		ORM.pool.on("error", (err, client) => {
			console.error("Unexpected error on idle client", err, client);
		});
	}

	static async query(queryText: string, values?: any[]): Promise<QueryResult> {
		let result: any;
		try {
			result = await ORM.pool.query(queryText, values);
		} catch(e) {
			console.error(e, queryText, values);
		}
		return result;
	}

	static async getByQuery<T extends EntityClass>(entityClass: T, queryText: string): Promise<T[]> {
		const result = await ORM.query(queryText);
		const entities = result.rows.map(raw => ORM.map(entityClass, raw));
		await Promise.all(entities.map(entity => ORM.populate(entity)));
		return entities;
	}

	static map<T extends EntityClass>(entityClass: T, raw: EntityData): T {
		const entity = new entityClass(raw.id) as any;
		if (entity.isInitialized()) {
			return entity;
		}
		return ORM.mapEntity(entity, raw) as any;
	}

	static mapEntity<T extends IEntity>(entity: any, raw: EntityData): InstanceType<T> {
		const model = DB.get(entity.constructor as typeof Entity);
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
		entity.__helper.original = raw;
		entity.__helper.populated = populated;
		return entity;
	}

	static unmap(entity: Entity): EntityData {
		const raw: EntityData = {};
		const model = DB.get(entity.constructor as typeof Entity);
		assert(model);

		for (const [property, options] of model) {
			let dbProperty = _.snakeCase(property);
			if (options.vector) {
				dbProperty = (dbProperty == "position" ? "" : `${dbProperty}_`);
				raw[`${dbProperty}x`] = entity[property].x;
				raw[`${dbProperty}y`] = entity[property].y;
			} else if (options.manyToOne) {
				dbProperty += "_id";
				raw[dbProperty] = (entity[property] ? entity[property].id : entity[property]);
			} else {
				raw[dbProperty] = entity[property];
			}
		}

		return raw;
	}

	static async find<T extends IEntity>(entityClass: T, where?: number | string): Promise<InstanceType<T>[]> {
		const model = _.snakeCase(entityClass.name);
		let queryText = `SELECT * FROM "${model}"`;
		if (where) {
			queryText += " WHERE " + (typeof where == "number" ? `id=${where}` : where);
		}
		return await ORM.getByQuery(entityClass as any, queryText) as any;
	}

	static getIfCached<T extends IEntity>(entityClass: any, id: number): InstanceType<T> | null {
		const entries = MapUtil.getMap(ORM.cachedEntries, entityClass);
		if (entries.has(id)) {
			return entries.get(id) as any;
		}
		return null;
	}

	static async findOne<T extends IEntity>(entityClass: T, where?: number | string): Promise<InstanceType<T> | null> {
		const tryCache = (typeof where == "number" ? ORM.getIfCached(entityClass, where) : null);
		if (tryCache && tryCache.isInitialized()) {
			return tryCache as any;
		}
		const objects = await ORM.find(entityClass, where);
		assert(objects.length <= 1);
		return (objects.length > 0 ? objects[0] as InstanceType<T> : null);
	}

	static async findOneOrFail<T extends IEntity>(entityClass: T, where?: number | string): Promise<InstanceType<T>> {
		const result = await ORM.findOne(entityClass, where);
		assert(result != null);
		return result as InstanceType<T>;
	}

	static async populate(entity: any): Promise<void> {
		if (entity.__helper.populated) {
			return;
		}
		const model = DB.get((entity as any).constructor);
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

	static async flush(): Promise<void> {
		const changeSets: ChangeSet[] = [];

		const toInsert = this.toInsert;
		this.toInsert = new Set;
		for (const entity of toInsert) {
			const model = _.snakeCase(entity.constructor.name);
			const [queryPart, values] = ORM.toSetQuery(entity, true);
			const result = await this.query(`INSERT INTO "${model}" ${queryPart} RETURNING id`, values);
			entity.id = result.rows[0].id;
			entity.__helper.notCreated = false;
			const entries = ORM.cachedEntries.get(entity.constructor as typeof Entity);
			if (entries) {
				entries.set(entity.id, entity);
			}
			await ORM.populate(entity);
			changeSets.push({entity, type: SyncType.Create, payload: {}});
		}

		const toUpdate = this.toUpdate;
		this.toUpdate = new Map;
		for (const [model, modelChanges] of toUpdate) {
			for (const [entity, entityChanges] of modelChanges) {
				const [queryPart, values] = ORM.toSetQuery(entity, false, entityChanges);
				if (!queryPart) {
					continue;
				}
				if (!entity.isRemoved()) {
					values.push(entity.id);
					const modelName = _.snakeCase(model.name);
					await this.query(`UPDATE "${modelName}" SET ${queryPart} WHERE id = $${values.length}`, values);
				}
				const payload = _.pick(entity, Array.from(entityChanges));
				const original = entity.__helper.original;
				entity.__helper.original = ORM.unmap(entity);
				changeSets.push({entity, type: SyncType.Update, payload, original});
			}
		}

		const toDelete = this.toDelete;
		this.toDelete = new Set;
		for (const entity of toDelete) {
			const model = _.snakeCase(entity.constructor.name);
			await this.query(`DELETE FROM ${model} WHERE id=$1`, [entity.id]);
			changeSets.push({entity, type: SyncType.Delete, payload: {}});
		}

		await ORM.getChanges(changeSets);
	}

	static insert(entity: Entity): void {
		this.toInsert.add(entity);
	}

	static update(entity: Entity, property: string): void {
		const model = DB.get(entity.constructor as typeof Entity);
		if (!model) { //  || !model.has(property)
			return;
		}
		const modelChanges = MapUtil.getMap(this.toUpdate, entity.constructor);
		const entityChanges = MapUtil.getSet(modelChanges, entity);
		entityChanges.add(property);
	}

	static remove(entity: Entity): void {
		this.toDelete.add(entity);
		MapUtil.getMap(ORM.cachedEntries, entity.constructor).delete(entity.id);
	}

	private static toSetQuery(entity: any, insert = false, properties?: Set<string> | IterableIterator<string>): [queryPart: string, values: any[]] {
		const model = DB.get(entity.constructor as any);
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