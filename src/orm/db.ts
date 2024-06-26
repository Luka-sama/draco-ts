import assert from "assert/strict";
import postgres, {ParameterOrFragment, PendingQuery, PostgresType, Sql, TransactionSql} from "postgres";
import Logger from "../core/logger.js";
import {
	Conditions,
	CreateIndexOptions,
	CreateTableOptions,
	DBValue,
	DropIndexOptions,
	DropTableOptions,
	FieldDefinition,
	IndexDefinition,
	IndexType,
	Row,
	SelectOptions
} from "./db.typings.js";
import Operator, {and, or} from "./operator.js";

const sqlFragment = Symbol("sqlFragment"); // Prevent user-side calling (without using draco-ts)
/** A fragment of a SQL query (or a full query) that was created with {@link DB.sql} */
export interface SqlFragment {
	[sqlFragment]: PendingQuery<Row[]>;
}

/**
 * This class is responsible for connecting to the DB and executing DB queries.
 * It also provides a simple query builder
 */
export default class DB {
	private static readonly logger = new Logger(DB);
	private readonly postgres: Sql<Record<string, PostgresType> extends {
		bigint: PostgresType<bigint>
	} ? Record<string, never> : any>;

	/** Connects to the database */
	public constructor(dbUrl: string) {
		this.postgres = postgres(dbUrl, {
			types: {
				bigint: postgres.BigInt
			},
			onnotice: DB.logger.info,
		});
		this.sql = this.sql.bind(this);
		this.name = this.name.bind(this);
		this.list = this.list.bind(this);
		this.unsafe = this.unsafe.bind(this);
	}

	/** Closes database connection */
	public async close(): Promise<void> {
		await this.postgres.end();
	}

	/**
	 * Used as a tagged templated function, it returns {@link SqlFragment}. An example:
	 * ```ts
	 * await db.query(db.sql`SELECT * FROM "user" WHERE "name"=${userName}`);
	 * ```
	 * Any generic value will be serialized according to an inferred type,
	 * and replaced by a PostgreSQL protocol placeholder `$1, $2, ...`.
	 * The parameters are then sent separately to the database which handles escaping & casting.
	 */
	public sql(
		first: TemplateStringsArray,
		...rest: readonly (ParameterOrFragment<(typeof this.postgres extends Sql<infer U> ? U : never)[
			keyof (typeof this.postgres extends Sql<infer U> ? U : never)
			]> | SqlFragment)[]
	): SqlFragment {
		const fragment = this.postgres(first, ...rest.map(value => (
			value && typeof value == "object" && sqlFragment in value ? (value as SqlFragment)[sqlFragment] : value
		)));
		return {[sqlFragment]: fragment};
	}

	/**
	 * Used in {@link DB.sql}, it inserts an identifier (e.g. field or table name).
	 * Useful if you have a variable with an identifier, otherwise you can just put the name in quotes.
	 */
	public name(identifier: string): postgres.Helper<string, string[]> {
		return this.postgres(identifier);
	}

	/**
	 * Used in {@link DB.sql}, it inserts a list of strings or numbers.
	 * Useful for conditions like `WHERE id IN ${db.list([1, 2, 3])}`
	 */
	public list(array: (string | number)[]): postgres.Helper<(string | number)[], (string | number)[]> {
		return this.postgres(array);
	}

	/** Used in {@link DB.sql}, it inserts the given string as is, without any escaping */
	public unsafe(query: string): SqlFragment {
		return {[sqlFragment]: this.postgres.unsafe(query)};
	}

	/** Executes the given query that was built with {@link DB.sql} */
	public async query(query: SqlFragment): Promise<Awaited<PendingQuery<Row[]>>> {
		try {
			return await query[sqlFragment].execute();
		} catch(e: unknown) {
			if (e instanceof postgres.PostgresError) {
				DB.logger.error(`${e.query}\n${e.stack}`);
			}
			throw e;
		}
	}

	/**
	 * Executes the given query that can be unsafe (and vulnerable to SQL injections).
	 * It is strongly recommended to use {@link DB.sql} instead.
	 */
	public async queryUnsafe(query: string): Promise<Awaited<PendingQuery<Row[]>>> {
		return await this.query(this.unsafe(query));
	}

	/**
	 * Starts a new transaction. It will reserve a connection for all transactions uses in the callback function.
	 * `BEGIN` is automatically sent, and if anything fails `ROLLBACK` will be called so the connection can be released
	 * and execution can continue. Otherwise, this method will resolve with the returned value
	 * from the callback function.
	 */
	public async runTransaction<T>(
		cb: (sql: TransactionSql<(typeof this.postgres extends Sql<infer U> ? U : never)>) => Promise<T>
	): Promise<T extends any[] ? {
		[k in keyof T]: T[k] extends Promise<infer R> ? R : T[k]
	} : T> {
		return await this.postgres.begin(cb);
	}

	/** Selects rows from the given table by the given conditions using the given options */
	public async select(table: string, conditions?: Conditions, options?: Partial<SelectOptions>): Promise<Row[]> {
		const {sql, name} = this;
		const fields = (
			options?.fields ? this.postgres(options.fields) : sql`*`
		);
		const where = this.getWhere(conditions);
		const result = await this.query(sql`SELECT ${fields} FROM ${name(table)} WHERE ${where}`);
		return Array.from(result);
	}

	/** Inserts the given row(s) in the given table */
	public async insert(
		table: string, data: {[column: string]: DBValue} | {[column: string]: DBValue}[]
	): Promise<number> {
		const {sql, name} = this;
		const result = await this.query(sql`INSERT INTO ${name(table)} ${this.postgres(data)}`);
		return result.count;
	}

	/** Updates rows from the given table (that meet the given conditions) with the given data */
	public async update(
		table: string, data: {[column: string]: DBValue}, conditions?: Conditions
	): Promise<number> {
		const {sql, name} = this;
		const where = this.getWhere(conditions);
		const result = await this.query(sql`UPDATE ${name(table)} SET ${this.postgres(data)} WHERE ${where}`);
		return result.count;
	}

	/** Deletes rows from the given table by the given conditions */
	public async delete(table: string, conditions?: Conditions): Promise<number> {
		const {sql, name} = this;
		const where = this.getWhere(conditions);
		const result = await this.query(sql`DELETE FROM ${name(table)} WHERE ${where}`);
		return result.count;
	}

	/** Creates a table with the given fields and indexes using the given options */
	public async createTable(
		table: string, fields: FieldDefinition[], indexes: IndexDefinition[], options?: Partial<CreateTableOptions>
	): Promise<void> {
		const {sql, name} = this;
		let query = sql`CREATE TABLE${options?.ifNotExists ? sql` IF NOT EXISTS` : sql``} ${name(table)} (`;

		const parts: SqlFragment[] = [];
		for (const field of fields) {
			parts.push(this.buildFieldString(field));
		}

		const indexesToCreate: IndexDefinition[] = [];
		for (const index of indexes) {
			const indexName = (index.name ? sql`CONSTRAINT ${name(index.name)} ` : sql``);
			const fields = this.postgres(index.fields ? index.fields : [index.field]);
			if (index.type == IndexType.Primary) {
				parts.push(sql`${indexName}PRIMARY KEY (${fields})`);
			} else if (index.type == IndexType.Unique) {
				parts.push(sql`${indexName}UNIQUE (${fields})`);
			} else {
				indexesToCreate.push(index);
			}
		}

		for (let i = 0; i < parts.length; i++) {
			query = sql`${query}${parts[i]}${i + 1 < parts.length ? sql`, ` : sql``}`;
		}
		query = sql`${query})`;
		await this.query(query);

		for (const index of indexesToCreate) {
			await this.createIndex(table, index);
		}
	}

	/** Creates an index by the given index definition using the given options */
	public async createIndex(
		table: string, index: IndexDefinition, options?: Partial<CreateIndexOptions>
	): Promise<void> {
		const {sql, name} = this;
		const fields = this.postgres(index.fields ? index.fields : index.field);

		if (index.type == IndexType.Primary) {
			assert(!options?.ifNotExists);
			const indexName = (index.name ? sql`CONSTRAINT ${name(index.name)} ` : sql``);
			await this.query(sql`ALTER TABLE ${name(table)} ADD ${indexName}PRIMARY KEY (${fields})`);
			return;
		}

		let query = (index.type == IndexType.Unique ? sql`CREATE UNIQUE INDEX ` : sql`CREATE INDEX `);
		if (options?.ifNotExists) {
			query = sql`${query}IF NOT EXISTS `;
		}
		if (index.name) {
			query = sql`${query}${name(index.name)} `;
		}
		query = sql`${query}ON ${name(table)} (${fields})`;
		await this.query(query);
	}

	/** Drops the given index using the given options */
	public async dropIndex(indexName: string, options?: Partial<DropIndexOptions>): Promise<void> {
		const {sql, name} = this;
		const ifExists = (options?.ifExists ? sql`IF EXISTS ` : sql``);
		await this.query(sql`DROP INDEX ${ifExists}${name(indexName)}`);
	}

	/** Drops the given table using the given options */
	public async dropTable(table: string, options?: Partial<DropTableOptions>): Promise<void> {
		const {sql, name} = this;
		const ifExists = (options?.ifExists ? sql` IF EXISTS` : sql``);
		await this.query(sql`DROP TABLE${ifExists} ${name(table)}`);
	}

	/** Creates a column by the given field definition */
	public async createColumn(table: string, field: FieldDefinition): Promise<void> {
		const {sql, name} = this;
		await this.query(sql`ALTER TABLE ${name(table)} ADD COLUMN ${this.buildFieldString(field)}`);
	}

	/** Drops the given column */
	public async dropColumn(table: string, field: string): Promise<void> {
		const {sql, name} = this;
		await this.query(sql`ALTER TABLE ${name(table)} DROP COLUMN ${name(field)}`);
	}

	/** Given the old and the new field definition, it alters the column in the given table */
	public async alterColumn(table: string, oldField: FieldDefinition, newField: FieldDefinition): Promise<void> {
		const {sql, name, unsafe} = this;
		const fieldName = name(newField.name);
		if (oldField.name != newField.name) {
			await this.query(
				sql`ALTER TABLE ${name(table)} RENAME COLUMN ${name(oldField.name)} TO ${fieldName}`
			);
		}

		if (oldField.type != newField.type) {
			const limit = (newField.limit ? sql`(${unsafe(newField.limit.toString())})` : sql``);
			const type = sql`${unsafe(newField.type)}${limit}`;
			await this.query(
				sql`ALTER TABLE ${name(table)} ALTER COLUMN ${fieldName} TYPE ${type}`
			);
		}

		if (!oldField.nullable && newField.nullable) {
			await this.query(
				sql`ALTER TABLE ${name(table)} ALTER COLUMN ${fieldName} DROP NOT NULL`
			);
		} else if (oldField.nullable && !newField.nullable) {
			await this.query(
				sql`ALTER TABLE ${name(table)} ALTER COLUMN ${fieldName} SET NOT NULL`
			);
		}

		if (oldField.default != newField.default) {
			if (newField.default === undefined) {
				await this.query(
					sql`ALTER TABLE ${name(table)} ALTER COLUMN ${fieldName} DROP DEFAULT`
				);
			} else if (newField.default === null) {
				await this.query(
					sql`ALTER TABLE ${name(table)} ALTER COLUMN ${fieldName} SET DEFAULT NULL`
				);
			} else {
				const defaultValue = unsafe(newField.default.toString());
				await this.query(
					sql`ALTER TABLE ${name(table)} ALTER COLUMN ${fieldName} SET DEFAULT ${defaultValue}`
				);
			}
		}
	}

	/** Builds {@link SqlFragment} with the field definition. It can then be used for `CREATE TABLE` or `ALTER TABLE` */
	private buildFieldString(field: FieldDefinition): SqlFragment {
		const {sql, name, unsafe} = this;
		const limit = (field.limit ? sql`(${unsafe(field.limit.toString())})` : sql``);
		const defaultValue = (field.default ? sql` DEFAULT ${unsafe(field.default.toString())}` : sql``);
		const nullable = (field.nullable ? sql`` : sql` NOT NULL`);
		return sql`${name(field.name)} ${unsafe(field.type)}${limit}${defaultValue}${nullable}`;
	}

	/** Transforms the given conditions in {@link SqlFragment} so that it can be directly inserted after `WHERE` */
	private getWhere(conditions?: Conditions): SqlFragment {
		const {sql} = this;
		if (!conditions || conditions instanceof Array && conditions.length < 1) {
			return sql`true`;
		} else if (!(conditions instanceof Array)) {
			return this.getWhere([conditions]);
		}

		const orParts: SqlFragment[] = [];
		for (const condition of conditions) {
			const andParts: SqlFragment[] = [];
			if (condition[and]) {
				andParts.push(...condition[and].map(this.getWhere.bind(this)));
			}
			if (condition[or]) {
				andParts.push(sql`(${this.getWhere(condition[or])})`);
			}
			for (const [field, value] of Object.entries(condition)) {
				andParts.push(this.buildCondition(field, value));
			}
			orParts.push(sql`(${this.buildWhereParts(andParts)})`);
		}
		return this.buildWhereParts(orParts, false);
	}

	/** Builds a single condition, e.g. `"name"=$1`, `"id" IN ($1, $2, $3)` or `"status" >= $1` */
	private buildCondition(
		field: string, value: DBValue | DBValue[] | Operator
	): SqlFragment {
		const {sql, name, unsafe} = this;
		if (value instanceof Array) {
			return sql`${name(field)} IN ${this.postgres(value)}`;
		} else if (value instanceof Operator && value.operand2) {
			return sql`${name(field)} ${unsafe(value.operator)} ${value.operand} AND ${value.operand2}`;
		} else if (value instanceof Operator) {
			return sql`${name(field)} ${unsafe(value.operator)} ${value.operand}`;
		} else {
			return sql`${name(field)} = ${value}`;
		}
	}

	/** Connects the given SQL fragments with `AND` or `OR` (depending on the value of `conjunction`) */
	private buildWhereParts(parts: SqlFragment[], conjunction = true): SqlFragment {
		const sql = this.sql;
		let where = sql``;
		let isBegin = true;
		for (const part of parts) {
			if (isBegin) {
				where = part;
			} else if (conjunction) {
				where = sql`${where} AND ${part}`;
			} else {
				where = sql`${where} OR ${part}`;
			}
			isBegin = false;
		}
		return where;
	}
}