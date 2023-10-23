import {Vec2, Vec3, Vector2, Vector3} from "./vector.js";

describe("Vector2", () => {
	const a = new Vector2(1, 2);
	const a2 = new Vector2(1 - 1e-9, 2);
	const b = new Vector2(1, 3);
	const n = new Vector2(10, -15);

	test("add", () => {
		const c = a.add(b);
		expect(c.x).toBe(2);
		expect(c.y).toBe(5);
	});

	test("sub", () => {
		const c = a.sub(b);
		expect(c.x).toBe(0);
		expect(c.y).toBe(-1);
	});

	test("mul with vector", () => {
		const c = a.mul(b);
		expect(c.x).toBe(1);
		expect(c.y).toBe(6);
	});

	test("mul with number", () => {
		const c = a.mul(5);
		expect(c.x).toBe(5);
		expect(c.y).toBe(10);
	});

	test("div with vector", () => {
		const c = a.div(b);
		expect(c.x).toBe(1);
		expect(c.y).toBeCloseTo(2/3);
	});

	test("div with number", () => {
		const c = a.div(2);
		expect(c.x).toBeCloseTo(0.5);
		expect(c.y).toBe(1);
	});

	test("intdiv with vector", () => {
		const c = a.intdiv(b);
		expect(c.x).toBe(1);
		expect(c.y).toBe(0);
	});

	test("intdiv with number", () => {
		const c = a.intdiv(2);
		expect(c.x).toBe(0);
		expect(c.y).toBe(1);
	});

	test("negated", () => {
		const c = a.negated();
		expect(c.x).toBe(-1);
		expect(c.y).toBe(-2);
	});

	test("sign", () => {
		const c = n.sign();
		expect(c.x).toBe(1);
		expect(c.y).toBe(-1);
	});

	test("abs", () => {
		const c = n.abs();
		expect(c.x).toBe(10);
		expect(c.y).toBe(15);
	});

	test("isInt", () => {
		expect(a.isInt()).toBeTruthy();
		expect(a2.isInt()).toBeFalsy();
	});

	test("equals", () => {
		expect(a.equals(b)).toBeFalsy();
		expect(a.equals(a2)).toBeTruthy();
	});

	test("isElementOf", () => {
		const array = [a, b];
		expect(a2.isElementOf(array)).toBeTruthy();
		expect(n.isElementOf(array)).toBeFalsy();
	});

	test("lengthSquared", () => {
		expect(a.lengthSquared()).toBe(1 ** 2 + 2 ** 2);
	});

	test("length", () => {
		expect(a.length()).toBeCloseTo(Math.sqrt(1 ** 2 + 2 ** 2));
	});

	test("distanceSquaredTo", () => {
		const c = new Vector2(4, 6);
		expect(a.distanceSquaredTo(c)).toBeCloseTo(25);
		expect(a.distanceSquaredTo(c, true)).toBeCloseTo(13);
	});

	test("distanceTo", () => {
		const c = new Vector2(4, 6);
		expect(a.distanceTo(c)).toBeCloseTo(5);
		expect(a.distanceTo(c, true)).toBeCloseTo(Math.sqrt(13));
	});

	test("toStaggered", () => {
		const c = a.toStaggered();
		expect(c.x).toBe(1);
		expect(c.y).toBe(4);
	});

	test("toString", () => {
		expect(`${a}`).toBe("(1, 2)");
	});

	test("toPlain", () => {
		const c = a.toPlain();
		expect(c).not.toBeInstanceOf(Vector2);
		expect(c).toEqual({x: 1, y: 2});
	});

	test("toVector3", () => {
		const c = a.toVector3(4);
		expect(c).toBeInstanceOf(Vector3);
		expect(c.x).toBe(1);
		expect(c.y).toBe(2);
		expect(c.z).toBe(4);
	});
});

describe("Vec2", () => {
	test("no arguments", () => {
		const a = Vec2();
		expect(a).toBeInstanceOf(Vector2);
		expect(a.x).toBe(0);
		expect(a.y).toBe(0);
	});

	test("from object", () => {
		const a = Vec2({x: 3, y: 4});
		expect(a).toBeInstanceOf(Vector2);
		expect(a.x).toBe(3);
		expect(a.y).toBe(4);
	});

	test("one numeric argument", () => {
		const a = Vec2(7);
		expect(a).toBeInstanceOf(Vector2);
		expect(a.x).toBe(7);
		expect(a.y).toBe(7);
	});

	test("two numeric arguments", () => {
		const a = Vec2(3, 4);
		expect(a).toBeInstanceOf(Vector2);
		expect(a.x).toBe(3);
		expect(a.y).toBe(4);
	});
});

describe("Vector3", () => {
	const a = new Vector3(1, 2, 5);
	const b = new Vector3(-1, 4, 3);

	test("add", () => {
		const c = a.add(b);
		expect(c.x).toBe(0);
		expect(c.y).toBe(6);
		expect(c.z).toBe(8);
	});

	test("toVector3", () => {
		const c = a.toVector2();
		expect(c).toBeInstanceOf(Vector2);
		expect(c.x).toBe(1);
		expect(c.y).toBe(2);
	});
});

describe("Vec3", () => {
	test("no arguments", () => {
		const a = Vec3();
		expect(a).toBeInstanceOf(Vector3);
		expect(a.x).toBe(0);
		expect(a.y).toBe(0);
		expect(a.z).toBe(0);
	});

	test("from object", () => {
		const a = Vec3({x: 3, y: 4, z: 5});
		expect(a).toBeInstanceOf(Vector3);
		expect(a.x).toBe(3);
		expect(a.y).toBe(4);
		expect(a.z).toBe(5);
	});

	test("one numeric argument", () => {
		const a = Vec3(7);
		expect(a).toBeInstanceOf(Vector3);
		expect(a.x).toBe(7);
		expect(a.y).toBe(7);
		expect(a.z).toBe(7);
	});

	test("three numeric arguments", () => {
		const a = Vec3(3, 4, 10);
		expect(a).toBeInstanceOf(Vector3);
		expect(a.x).toBe(3);
		expect(a.y).toBe(4);
		expect(a.z).toBe(10);
	});
});