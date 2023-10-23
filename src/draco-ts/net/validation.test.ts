import assert from "assert/strict";
import {
	ensure,
	Is,
	JSONData,
	JSONDataExtended,
	JSONObject,
	JSONObjectExtended,
	Of,
	WrongDataError
} from "./validation.js";
import {Vec2, Vector2} from "./vector.js";

describe("ensure", () => {
	function check<T extends JSONDataExtended>(
		raw: JSONData, shouldPass: boolean, shouldBe: T, resultShouldBe?: JSONDataExtended
	): T | undefined {
		if (shouldPass) {
			const result = ensure(raw, shouldBe);
			expect(result).toStrictEqual(resultShouldBe || raw);
			return result;
		} else {
			expect(() => ensure(raw, shouldBe)).toThrow(WrongDataError);
		}
	}

	test.each([
		[{name: "test", count: 123, pi: 3, flag: false}, true],
		[{name: "test", count: 123, pi: 3.14, flag: false}, true],
		[{name: "test", count: 3.14, pi: 3.14, flag: false}, false],
		[{name: "test", count: "123", pi: 3.14, flag: false}, false],
		[{name: "test", count: 123, pi: 3.14, flag: false, extraKey: true}, false],
		[{name: "test", pi: 3.14, flag: false}, false],
	])("simple object", (raw: JSONObject, shouldPass: boolean) => {
		const shouldBe = {name: Is.string, count: Is.int, pi: Is.float, flag: Is.bool};
		check(raw, shouldPass, shouldBe);
	});

	test.each([
		[{ids: [1, 2, 3]}, true],
		[{ids: []}, true],
		[{ids: [1, "2", 3]}, false],
		[{ids: {}}, false],
	])("array", (raw: JSONObject, shouldPass: boolean) => {
		const shouldBe = {ids: Is.array(Of.ints)};
		check(raw, shouldPass, shouldBe);
	});

	test.each([
		[{ids: [[1, 2, 3], [2, 3, 4], [10, 20, 30]]}, true],
		[{ids: []}, true],
		[{ids: [[1, 2, 3], [2, 3, 4], [10, "20", 30]]}, false],
		[{ids: [null, [1, 2, 3]]}, false],
		[{ids: [[1, 2, 3], 4]}, false]
	])("array of arrays", (raw: JSONObject, shouldPass: boolean) => {
		const shouldBe = {ids: Is.array(Of.arrays(Of.ints))};
		check(raw, shouldPass, shouldBe);
	});

	test.each([
		[{lvl1: {lvl2: {lvl3: 123}, sth2: ["test", "string"]}}, true],
		[{lvl1: {lvl2: {lvl3: "123"}, sth2: ["test", "string"]}}, false],
		[{lvl1: {lvl2: {lvl3: 123}}}, false],
	])("object", (raw: JSONObject, shouldPass: boolean) => {
		const shouldBe = {lvl1: {lvl2: {lvl3: Is.int}, sth2: Is.array(Of.strings)}};
		check(raw, shouldPass, shouldBe);
	});

	test.each([
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5}]}, true, {diffs: [Vec2(7, 4), Vec2(10, 5)]}],
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5.5}]}, true, {diffs: [Vec2(7, 4), Vec2(10, 5.5)]}],
		[{diffs: [{x: 7, y: 4}, {x: 10, z: 5}]}, false, undefined],
	])("vectors", (raw: JSONObject, shouldPass: boolean, resultShouldBe?: JSONObjectExtended) => {
		const shouldBe = {diffs: Is.array(Of.vec2fs)};
		const result = check(raw, shouldPass, shouldBe, resultShouldBe);

		if (shouldPass) {
			assert(result);
			const first = result.diffs[0];
			expect(first instanceof Vector2).toBeTruthy();
			expect(first.x).toBe(7);
			expect(first.y).toBe(4);
		}
	});

	test.each([
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5}]}, true, {diffs: [Vec2(7, 4), Vec2(10, 5)]}],
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5.5}]}, false, undefined],
		[{diffs: [{x: 7, y: 4}, {x: 10, z: 5}]}, false, undefined],
	])("int vectors", (raw: JSONObject, shouldPass: boolean, resultShouldBe?: JSONObjectExtended) => {
		const shouldBe = {diffs: Is.array(Of.vec2is)};
		const result = check(raw, shouldPass, shouldBe, resultShouldBe);

		if (shouldPass) {
			assert(result);
			const second = result.diffs[1];
			expect(second instanceof Vector2).toBeTruthy();
			expect(second.x).toBe(10);
			expect(second.y).toBe(5);
		}
	});

	test("data is vector", () => {
		const shouldBe = Is.vec2i;
		const raw = {x: 2, y: 3};
		const val = ensure(raw, shouldBe);
		expect(val).toBeInstanceOf(Vector2);
		expect(val.x).toBe(2);
		expect(val.y).toEqual(3);
	});

	test("raw data is already vector", () => {
		const shouldBe = Is.vec2i;
		const raw = Vec2(2, 3);
		const val = ensure(raw, shouldBe);
		expect(val).toBeInstanceOf(Vector2);
		expect(val.x).toBe(2);
		expect(val.y).toEqual(3);
	});

	test("allowUnknownKeys and clone", () => {
		const shouldBe = Is.array({a: Is.int, c: Is.int});
		const raw = [{a: 1, b: 2, c: 3}];
		check(raw, false, shouldBe);
		expect(ensure(raw, shouldBe, true)).toStrictEqual([{a: 1, c: 3}]);
		expect(ensure(raw, shouldBe, true, false)).toStrictEqual(raw);
		expect(raw).toStrictEqual([{a: 1, b: 2, c: 3}]);
	});
});