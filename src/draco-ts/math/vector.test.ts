import assert from "assert/strict";
import {describe, test} from "node:test";
import {Vec2f, Vec3f, Vector2f, Vector2i, Vector3f, Vector3i} from "./vector.js";

describe("Vector2f", () => {
	const a = new Vector2f(1, 2);
	const a2 = new Vector2f(1 - 1e-9, 2);
	const b = new Vector2f(1, 3);
	const n = new Vector2f(10, -15);

	test("add", () => {
		const c = a.add(b);
		assert.equal(c.x, 2);
		assert.equal(c.y, 5);
	});

	test("sub", () => {
		const c = a.sub(b);
		assert.equal(c.x, 0);
		assert.equal(c.y, -1);
	});

	test("mul with vector", () => {
		const c = a.mul(b);
		assert.equal(c.x, 1);
		assert.equal(c.y, 6);
	});

	test("mul with number", () => {
		const c = a.mul(5);
		assert.equal(c.x, 5);
		assert.equal(c.y, 10);
	});

	test("div with vector", () => {
		const c = a.div(b);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2/3);
	});

	test("div with number", () => {
		const c = a.div(2);
		assert.equal(c.x, 0.5);
		assert.equal(c.y, 1);
	});

	test("intdiv with vector", () => {
		const c = a.intdiv(b);
		assert.equal(c.x, 1);
		assert.equal(c.y, 0);
	});

	test("intdiv with number", () => {
		const c = a.intdiv(2);
		assert.equal(c.x, 0);
		assert.equal(c.y, 1);
	});

	test("negated", () => {
		const c = a.negated();
		assert.equal(c.x, -1);
		assert.equal(c.y, -2);
	});

	test("sign", () => {
		const c = n.sign();
		assert.equal(c.x, 1);
		assert.equal(c.y, -1);
	});

	test("abs", () => {
		const c = n.abs();
		assert.equal(c.x, 10);
		assert.equal(c.y, 15);
	});

	test("isInt", () => {
		assert.equal(a.isInt(), true);
		assert.equal(a2.isInt(), false);
	});

	test("equals", () => {
		assert.equal(a.equals(b), false);
		assert.equal(a.equals(a2), true);
	});

	test("isElementOf", () => {
		const array = [a, b];
		assert.equal(a2.isElementOf(array), true);
		assert.equal(n.isElementOf(array), false);
	});

	test("lengthSquared", () => {
		assert.equal(a.lengthSquared(), 1 ** 2 + 2 ** 2);
	});

	test("length", () => {
		assert.equal(a.length(), Math.sqrt(1 ** 2 + 2 ** 2));
	});

	test("distanceSquaredTo", () => {
		const c = new Vector2f(4, 6);
		assert.equal(a.distanceSquaredTo(c), 25);
		assert.equal(a.distanceSquaredTo(c, true), 13);
	});

	test("distanceTo", () => {
		const c = new Vector2f(4, 6);
		assert.equal(a.distanceTo(c), 5);
		assert.equal(a.distanceTo(c, true), Math.sqrt(13));
	});

	test("toStaggered", () => {
		const c = a.toStaggered();
		assert.equal(c.x, 1);
		assert.equal(c.y, 4);
	});

	test("toString", () => {
		assert.equal(`${a}`, "(1, 2)");
	});

	test("toPlain", () => {
		const c = a.toPlain();
		assert.deepEqual(c, {x: 1, y: 2});
	});

	test("toVector2i", () => {
		const c = a2.toVector2i();
		assert(c instanceof Vector2i);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
	});

	test("toVector3f", () => {
		const c = a.toVector3f(4);
		assert(c instanceof Vector3f);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
		assert.equal(c.z, 4);
	});

	test("toVector3i", () => {
		const c = a2.toVector3i(4);
		assert(c instanceof Vector3i);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
		assert.equal(c.z, 4);
	});
});

describe("Vector2i", () => {
	const a = new Vector2i(1, 2);
	const b = new Vector2i(1, 3);

	test("add", () => {
		const c = a.add(b);
		assert.equal(c.x, 2);
		assert.equal(c.y, 5);
	});

	test("toPlain", () => {
		const c = a.toPlain();
		assert.deepEqual(c, {x: 1, y: 2});
	});

	test("toVector2f", () => {
		const c = a.toVector2f();
		assert(c instanceof Vector2f);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
	});

	test("toVector3f", () => {
		const c = a.toVector3f(5);
		assert(c instanceof Vector3f);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
		assert.equal(c.z, 5);
	});

	test("toVector3i", () => {
		const c = a.toVector3i(5);
		assert(c instanceof Vector3i);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
		assert.equal(c.z, 5);
	});
});

describe("Vector3f", () => {
	const a = new Vector3f(1, 2, 5);
	const a2 = new Vector3f(1.3, 2, 5.1);
	const b = new Vector3f(-1, 4, 3);

	test("add", () => {
		const c = a.add(b);
		assert.equal(c.x, 0);
		assert.equal(c.y, 6);
		assert.equal(c.z, 8);
	});

	test("toPlain", () => {
		const c = a.toPlain();
		assert.deepEqual(c, {x: 1, y: 2, z: 5});
	});

	test("toVector2f", () => {
		const c = a.toVector2f();
		assert(c instanceof Vector2f);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
	});

	test("toVector2i", () => {
		const c = a2.toVector2i();
		assert(c instanceof Vector2i);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
	});

	test("toVector3i", () => {
		const c = a2.toVector3i();
		assert(c instanceof Vector3i);
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
		assert.equal(c.z, 5);
	});
});

describe("Vector3i", () => {
	const a = new Vector3i(1, 3, 5);
	const b = new Vector3i(-1, 4, 3);

	test("add", () => {
		const c = a.add(b);
		assert.equal(c.x, 0);
		assert.equal(c.y, 7);
		assert.equal(c.z, 8);
	});

	test("toPlain", () => {
		const c = a.toPlain();
		assert.deepEqual(c, {x: 1, y: 3, z: 5});
	});

	test("toVector2f", () => {
		const c = a.toVector2f();
		assert(c instanceof Vector2f);
		assert.equal(c.x, 1);
		assert.equal(c.y, 3);
	});

	test("toVector2i", () => {
		const c = a.toVector2i();
		assert(c instanceof Vector2i);
		assert.equal(c.x, 1);
		assert.equal(c.y, 3);
	});

	test("toVector3f", () => {
		const c = a.toVector3f();
		assert(c instanceof Vector3f);
		assert.equal(c.x, 1);
		assert.equal(c.y, 3);
		assert.equal(c.z, 5);
	});
});

describe("Vec2f", () => {
	test("from object", () => {
		const a = Vec2f({x: 3, y: 4});
		assert(a instanceof Vector2f);
		assert.equal(a.x, 3);
		assert.equal(a.y, 4);
	});

	test("two numeric arguments", () => {
		const a = Vec2f(3, 4);
		assert(a instanceof Vector2f);
		assert.equal(a.x, 3);
		assert.equal(a.y, 4);
	});
});

describe("Vec3f", () => {
	test("from object", () => {
		const a = Vec3f({x: 3, y: 4, z: 5});
		assert(a instanceof Vector3f);
		assert.equal(a.x, 3);
		assert.equal(a.y, 4);
		assert.equal(a.z, 5);
	});

	test("three numeric arguments", () => {
		const a = Vec3f(3, 4, 10);
		assert(a instanceof Vector3f);
		assert.equal(a.x, 3);
		assert.equal(a.y, 4);
		assert.equal(a.z, 10);
	});
});