import {Vec2, Vector2} from "./vector.js";

describe("Vector2", () => {
	const a = new Vector2(1, 2);
	const b = new Vector2(1, 3);

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

	test("equals", () => {
		const c = new Vector2(1, 2);
		expect(a.equals(b)).toBeFalsy();
		expect(a.equals(c)).toBeTruthy();
	});

	test("toPlain", () => {
		const c = a.toPlain();
		expect(c).not.toBeInstanceOf(Vector2);
		expect(c).toEqual({x: 1, y: 2});
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