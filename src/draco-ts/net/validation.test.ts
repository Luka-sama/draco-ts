import assert from "assert/strict";
import {describe, mock, test} from "node:test";
import {Vec2f, Vec2i, Vector2f, Vector2i} from "../math/vector.js";
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

describe("ensure", () => {
	const loggerError = mock.method(WrongDataError.logger, "error");
	loggerError.mock.mockImplementation(() => {});

	function check<T extends JSONDataExtended>(
		raw: JSONData, shouldPass: boolean, shouldBe: T, resultShouldBe?: JSONDataExtended
	): T | undefined {
		if (shouldPass) {
			const result = ensure(raw, shouldBe);
			assert.deepEqual(result, resultShouldBe || raw);
			return result;
		} else {
			assert.throws(() => ensure(raw, shouldBe), WrongDataError);
		}
	}

	test("simple object", () => {
		const cases: [JSONObject, boolean][] = [
			[{name: "test", count: 123, pi: 3, flag: false}, true],
			[{name: "test", count: 123, pi: 3.14, flag: false}, true],
			[{name: "test", count: 3.14, pi: 3.14, flag: false}, false],
			[{name: "test", count: "123", pi: 3.14, flag: false}, false],
			[{name: "test", count: 123, pi: 3.14, flag: false, extraKey: true}, false],
			[{name: "test", pi: 3.14, flag: false}, false],
		];
		const shouldBe = {name: Is.string, count: Is.int, pi: Is.float, flag: Is.bool};
		for (const [raw, shouldPass] of cases) {
			check(raw, shouldPass, shouldBe);
		}
	});

	test("array", () => {
		const cases: [JSONObject, boolean][] = [
			[{ids: [1, 2, 3]}, true],
			[{ids: []}, true],
			[{ids: [1, "2", 3]}, false],
			[{ids: {}}, false],
		];
		const shouldBe = {ids: Is.array(Of.ints)};
		for (const [raw, shouldPass] of cases) {
			check(raw, shouldPass, shouldBe);
		}
	});

	test("array of arrays", () => {
		const cases: [JSONObject, boolean][] = [
			[{ids: [[1, 2, 3], [2, 3, 4], [10, 20, 30]]}, true],
			[{ids: []}, true],
			[{ids: [[1, 2, 3], [2, 3, 4], [10, "20", 30]]}, false],
			[{ids: [null, [1, 2, 3]]}, false],
			[{ids: [[1, 2, 3], 4]}, false]
		];
		const shouldBe = {ids: Is.array(Of.arrays(Of.ints))};
		for (const [raw, shouldPass] of cases) {
			check(raw, shouldPass, shouldBe);
		}
	});

	test("object", () => {
		const cases: [JSONObject, boolean][] = [
			[{lvl1: {lvl2: {lvl3: 123}, sth2: ["test", "string"]}}, true],
			[{lvl1: {lvl2: {lvl3: "123"}, sth2: ["test", "string"]}}, false],
			[{lvl1: {lvl2: {lvl3: 123}}}, false],
		];
		const shouldBe = {lvl1: {lvl2: {lvl3: Is.int}, sth2: Is.array(Of.strings)}};
		for (const [raw, shouldPass] of cases) {
			check(raw, shouldPass, shouldBe);
		}
	});

	test("vectors", () => {
		const cases: [JSONObject, boolean, JSONObjectExtended?][] = [
			[{diffs: [{x: 7, y: 4}, {x: 10, y: 5}]}, true, {diffs: [Vec2f(7, 4), Vec2f(10, 5)]}],
			[{diffs: [{x: 7, y: 4}, {x: 10, y: 5.5}]}, true, {diffs: [Vec2f(7, 4), Vec2f(10, 5.5)]}],
			[{diffs: [{x: 7, y: 4}, {x: 10, z: 5}]}, false, undefined],
		];
		const shouldBe = {diffs: Is.array(Of.vec2fs)};

		for (const [raw, shouldPass, resultShouldBe] of cases) {
			const result = check(raw, shouldPass, shouldBe, resultShouldBe);
			if (shouldPass) {
				assert(result);
				const first = result.diffs[0];
				assert(first instanceof Vector2f);
				assert.equal(first.x, 7);
				assert.equal(first.y, 4);
			}
		}
	});

	test("int vectors", () => {
		const cases: [JSONObject, boolean, JSONObjectExtended?][] = [
			[{diffs: [{x: 7, y: 4}, {x: 10, y: 5}]}, true, {diffs: [Vec2i(7, 4), Vec2i(10, 5)]}],
			[{diffs: [{x: 7, y: 4}, {x: 10, y: 5.5}]}, false, undefined],
			[{diffs: [{x: 7, y: 4}, {x: 10, z: 5}]}, false, undefined],
		];
		const shouldBe = {diffs: Is.array(Of.vec2is)};

		for (const [raw, shouldPass, resultShouldBe] of cases) {
			const result = check(raw, shouldPass, shouldBe, resultShouldBe);
			if (shouldPass) {
				assert(result);
				const second = result.diffs[1];
				assert(second instanceof Vector2i);
				assert.equal(second.x, 10);
				assert.equal(second.y, 5);
			}
		}
	});

	test("data is vector", () => {
		const shouldBe = Is.vec2i;
		const raw = {x: 2, y: 3};
		const val = ensure(raw, shouldBe);
		assert(val instanceof Vector2i);
		assert.equal(val.x, 2);
		assert.equal(val.y, 3);
	});

	test("raw data is already vector", () => {
		const shouldBe = Is.vec2i;
		const raw = Vec2i(2, 3);
		const val = ensure(raw, shouldBe);
		assert(val instanceof Vector2i);
		assert.equal(val.x, 2);
		assert.equal(val.y, 3);
	});

	test("allowUnknownKeys and clone", () => {
		const shouldBe = Is.array({a: Is.int, c: Is.int});
		const raw = [{a: 1, b: 2, c: 3}];
		check(raw, false, shouldBe);
		assert.deepEqual(ensure(raw, shouldBe, true), [{a: 1, c: 3}]);
		assert.deepEqual(ensure(raw, shouldBe, true, false), raw);
		assert.deepEqual(raw, [{a: 1, b: 2, c: 3}]);
	});
});