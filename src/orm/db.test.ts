import assert from "assert/strict";
import {after, before, beforeEach, test} from "node:test";
import DB from "./db.js";
import {FieldType, IndexType} from "./db.typings.js";
import {and, between, gt, or} from "./operator.js";

let db: DB;
before(async () => {
	assert.equal(process.env.NODE_ENV, "test");
	assert(process.env.DB_URL);
	db = new DB(process.env.DB_URL);
});

after(async () => {
	await db.close();
});

beforeEach(async () => {
	await db.dropTable("user", {ifExists: true});
	await db.createTable("user", [
		{name: "id", type: FieldType.Serial},
		{name: "name", type: FieldType.Varchar, limit: 10},
		{name: "points", type: FieldType.Int, default: 100}
	], [
		{field: "id", type: IndexType.Primary},
		{fields: ["name", "points"], type: IndexType.Unique}
	]);
});

test("CRUD-queries", async () => {
	assert.deepEqual(
		await db.select("user"),
		[]
	);
	assert.equal(
		await db.insert("user", [
			{name: "Luka-sama", points: 123},
			{name: "Test", points: 99},
			{name: "New user", points: 321},
		]),
		3
	);
	assert.deepEqual(
		await db.select("user", {id: [0, 10]}),
		[]
	);
	assert.deepEqual(
		await db.select("user", {id: 2}),
		[{id: 2, name: "Test", points: 99}]
	);
	assert.equal(
		await db.update("user", {name: "Test-sama", points: 777}, {name: "Test"}),
		1
	);
	assert.deepEqual(
		await db.select("user", {id: 2}),
		[{id: 2, name: "Test-sama", points: 777}]
	);
	assert.equal(
		await db.delete("user", [{id: 1, points: 777}]),
		0
	);
	assert.equal(
		await db.delete("user", {[and]: [{id: 1}, {points: 777}]}),
		0
	);
	assert.equal(
		await db.delete("user", [{id: 10}, {points: 777}]),
		1
	);
	assert.equal(
		await db.insert("user", {name: "Test-sama"}),
		1
	);
	assert.deepEqual(
		await db.select(
			"user", {[or]: [{id: [2, 4]}, {name: "Test"}]}, {fields: ["id", "name"]}
		),
		[{id: 4, name: "Test-sama"}]
	);
	assert.deepEqual(
		await db.select(
			"user", {id: gt(3)}, {fields: ["id"]}
		),
		[{id: 4}]
	);
	assert.deepEqual(
		await db.select(
			"user", {id: between(4, 44)}, {fields: ["id"]}
		),
		[{id: 4}]
	);

	const userName = `'T"est`;
	assert.deepEqual(
		Array.from(await db.query(db.sql`
			SELECT ${db.name("id")}, ${db.name("name")}
			${db.unsafe("FROM")} ${db.name("user")}
			WHERE ${db.name("id")} IN ${db.list([4, 8, 16])} OR ${db.name("name")}=${userName}`
		)),
		[{id: 4, name: "Test-sama"}]
	);
	assert.deepEqual(
		Array.from(await db.queryUnsafe(`SELECT "id", "name" FROM "user" WHERE id=4`)),
		[{id: 4, name: "Test-sama"}]
	);

	// TODO: transactions, columns, indexes, bigints, field types
});