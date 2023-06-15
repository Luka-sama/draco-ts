import assert from "assert/strict";
import _ from "lodash";
import pg, {QueryResult} from "pg";
import MapUtil from "../util/map-util.js";
import {Vec2, Vector2} from "../util/vector.js";
import Collection from "./collection.js";
import Entity from "./entity.js";
import {DB, Property} from "./orm.decorator.js";
import {EntityClass, IEntity} from "./orm.typings.js";

class LightsGroup extends Entity {
	@Property()
	id!: number;

	@Property()
	speed!: number;

	@Property({vector: true})
	direction!: Vector2;
}

class Location extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;
}

class User extends Entity {
	@Property()
	id!: number;

	@Property()
	name!: string;

	@Property()
	regDate = new Date();

	@Property({manyToOne: () => Location as any})
	location!: Location;

	@Property({vector: true})
	position!: Vector2;

	@Property({oneToMany: [LightsGroup, "targetMage"]})
	lightsGroups = new Collection<LightsGroup>;
}

export default class ORM {
	private static pool: pg.Pool;
	private static cachedEntries = new Map<EntityClass, Map<number, Entity>>;
	private static toInsert = new Set<Entity>;
	private static toDelete = new Set<Entity>;
	private static toUpdate = new Set<Entity>;

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
		console.log(queryText);
		console.log(values);
		return await ORM.pool.query(queryText, values);
	}

	static async getByQuery<T extends EntityClass>(entityClass: T, queryText: string): Promise<T[]> {
		const result = await ORM.query(queryText);
		const entities = result.rows.map(raw => ORM.map(entityClass, raw));
		await Promise.all(entities.map(entity => ORM.populate(entity)));
		return entities;
	}

	static map<T extends EntityClass>(entityClass: T, raw: {[index: string]: any}): T {
		const entity = new entityClass as any;
		const model = DB.get(entityClass);
		assert(model);
		let populated = true;

		for (const [property, options] of model) {
			let dbProperty = _.snakeCase(property);
			if (options.vector) {
				if (dbProperty == "position") {
					entity[property] = Vec2(raw.x, raw.y);
				} else {
					entity[property] = Vec2(raw[`${dbProperty}_x`], raw[`${dbProperty}_y`]);
				}
			} else if (options.manyToOne) {
				populated = false;
				dbProperty += "_id";
				const constr = (typeof options.manyToOne == "function" ? (options.manyToOne as any)() : options.manyToOne);
				const reference = new constr;
				reference.id = raw[dbProperty];
				entity[property] = reference;
			} else if (options.oneToMany) {
				entity[property] = new Collection;
			} else {
				entity[property] = raw[dbProperty];
			}
		}

		entity.__helper.initialized = true;
		entity.__helper.populated = populated;
		const entries = MapUtil.getMap(ORM.cachedEntries, entityClass);
		return MapUtil.get(entries, entity.id, entity);
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
		if (tryCache) {
			return tryCache as any;
		}
		const entries = MapUtil.getMap(ORM.cachedEntries, entityClass as any);
		if (typeof where == "number" && entries.has(where)) {
			return entries.get(where) as any;
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

	static async test() {
		//const user = await User.getOrFail(1);
		//Message.create({text: "kwa kwa", user, location: user.location, position: user.position});
		//const msg = await Message.getOrFail(505);
		//msg.remove();
		//await ORM.flush();
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
				entity[property] = await ORM.findOne(reference.constructor, reference.id);
			} else if (options.oneToMany) {
				const [referenceClass, foreignKey] = options.oneToMany;
				entity[property].addEntities(await ORM.find(referenceClass, `${_.snakeCase(foreignKey)}_id=${entity.id}`));
				entity[property].__helper.initialized = true;
			}
		}

		entity.__helper.populated = true;
	}

	static async flush(): Promise<void> {
		const toInsert = this.toInsert;
		this.toInsert = new Set;
		for (const entity of toInsert) {
			const model = _.snakeCase(entity.constructor.name);
			const [queryPart, values] = ORM.toSetQuery(entity, true);
			await this.query(`INSERT INTO "${model}" ${queryPart} RETURNING id`, values);
		}

		const toUpdate = this.toUpdate;
		this.toUpdate = new Set;
		for (const entity of toUpdate) {
			const model = _.snakeCase(entity.constructor.name);
			const [queryPart, values] = ORM.toSetQuery(entity);
			values.push(entity.id);
			await this.query(`UPDATE "${model}" SET ${queryPart} WHERE id=${values.length}`, values);
		}

		const toDelete = this.toDelete;
		this.toDelete = new Set;
		for (const entity of toDelete) {
			const model = _.snakeCase(entity.constructor.name);
			await this.query(`DELETE FROM ${model} WHERE id=$1`, [entity.id]);
		}
	}

	static insert(entity: Entity): void {
		this.toInsert.add(entity);
	}

	static update(entity: Entity): void {
		this.toUpdate.add(entity);
	}

	static remove(entity: Entity): void {
		this.toDelete.add(entity);
	}

	private static toSetQuery(entity: any, insert = false): [queryPart: string, values: any[]] {
		const model = DB.get(entity.constructor as any);
		assert(model);
		const placeholders: string[] = [];
		const fields: string[] = [];
		const values: any[] = [];

		for (const [property, options] of model) {
			if (property == "id") {
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
				values.push(value.id);
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