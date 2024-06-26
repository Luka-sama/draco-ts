import {SerializablePrimitive} from "../core/typings.js";
import Operator from "./operator.js";

/** Any primitive value that can be stored in the database */
export type DBValue = SerializablePrimitive | bigint;

/** A row selected from the database */
export interface Row {
	[column: string]: DBValue;
}

/**
 * Condition (for query building). Examples:
 * ```ts
 * await db.select("user", {id: 1, name: "Test"});
 * ```
 * This will build the following query (and will pass the given data):
 * ```sql
 * SELECT * FROM "user" WHERE "id"=$1 AND "name"=$2
 * ```
 *
 * Also, you can use arrays to build conditions with `IN`:
 * ```ts
 * await db.select("user", {id: [1, 2, 3]});
 * ```
 * will be converted to:
 * ```sql
 * SELECT * FROM "user" WHERE "id" IN ($1, $2, $3)
 * ```
 *
 * See also {@link Operator}, {@link and}, {@link or} for more details and examples.
 */
export interface Condition {
	[column: string]: DBValue | DBValue[] | Operator;
	[column: symbol]: Condition[];
}
/** One or multiple conditions. See {@link Condition} for details */
export type Conditions = Condition | Condition[];

/** The field type */
export enum FieldType {
	BigInt = "bigint",
	BigSerial = "bigserial",
	Bool = "boolean",
	Char = "character",
	Varchar = "character varying",
	Date = "date",
	Double = "double precision",
	Ip = "inet",
	Int = "integer",
	Jsonb = "jsonb",
	Money = "money",
	Float = "real",
	Serial = "serial",
	Text = "text",
}

/** The field definition that can be used to create or alter a field */
export interface FieldDefinition {
	name: string;
	type: FieldType;
	/** It can be used e.g. to restrict `VARCHAR` to `n` symbols */
	limit?: number;
	/** If `false` (which is the default), the field will be `NOT NULL` */
	nullable?: boolean;
	/** The default value for this field */
	default?: DBValue;
}

/** The type of index that should be created */
export enum IndexType {Index, Unique, Primary}

/** The index definition that can be used to create an index over single field */
interface SingleFieldIndexDefinition {
	field: string;
	fields?: never;
	type?: IndexType;
	name?: string;
}

/** The index definition that can be used to create an index over multiple fields */
interface MultipleFieldsIndexDefinition {
	field?: never;
	fields: string[];
	type?: IndexType;
	name?: string;
}

/** The index definition that can be used to create an index */
export type IndexDefinition = SingleFieldIndexDefinition | MultipleFieldsIndexDefinition;

/** The options for `SELECT`-queries */
export interface SelectOptions {
	fields: string[];
}

/** The options for `CREATE TABLE`-queries */
export interface CreateTableOptions {
	ifNotExists: boolean;
}

/** The options for `CREATE INDEX`-queries */
export interface CreateIndexOptions {
	ifNotExists: boolean;
}

/** The options for `DROP INDEX`-queries */
export interface DropIndexOptions {
	ifExists: boolean;
}

/** The options for `DROP TABLE`-queries */
export interface DropTableOptions {
	ifExists: boolean;
}