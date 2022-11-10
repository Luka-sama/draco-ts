import assert from "assert/strict";
import {IsEmail} from "class-validator";
import {Vector2} from "../math/vector.embeddable";
import {ensure, hasErrors, Is, Of, toObject, WrongDataError} from "./validation";
import {UserData, UserDataExtended} from "./ws.typings";

describe("toObject, hasErrors", () => {
	class SomeEntity {
		@IsEmail({}, {message: "MAIL_FORMAT_WRONG"})
		mail = "";
	}

	test("wrong mail", async () => {
		const raw = {mail: "wrong mail"};
		const entity = await toObject(SomeEntity, raw);
		expect(hasErrors(entity)).toBeTruthy();
		expect(entity).toEqual(["MAIL_FORMAT_WRONG"]);
	});

	test("success", async () => {
		const raw = {mail: "test@test.org"};
		const entity = await toObject(SomeEntity, raw);
		expect(entity).toBeInstanceOf(SomeEntity);
		assert(!hasErrors(entity));
		expect(entity.mail).toBe(raw.mail);
	});
});

describe("ensure", () => {
	function check(raw: UserData, result: boolean, shouldBe: UserDataExtended): void {
		if (result) {
			expect(ensure(raw, shouldBe)).toBe(raw);
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
	])("simple object", (raw: UserData, result: boolean) => {
		const shouldBe = {name: Is.string, count: Is.int, pi: Is.double, flag: Is.bool};
		check(raw, result, shouldBe);
	});

	test.each([
		[{ids: [1, 2, 3]}, true],
		[{ids: []}, true],
		[{ids: [1, "2", 3]}, false],
		[{ids: {}}, false],
	])("array", (raw: UserData, result: boolean) => {
		const shouldBe = {ids: Is.array(Of.ints)};
		check(raw, result, shouldBe);
	});

	test.each([
		[{ids: [[1, 2, 3], [2, 3, 4], [10, 20, 30]]}, true],
		[{ids: []}, true],
		[{ids: [[1, 2, 3], [2, 3, 4], [10, "20", 30]]}, false],
		[{ids: [null, [1, 2, 3]]}, false],
		[{ids: [[1, 2, 3], 4]}, false]
	])("array of arrays", (raw: UserData, result: boolean) => {
		const shouldBe = {ids: Is.array(Of.arrays(Of.ints))};
		check(raw, result, shouldBe);
	});

	test.each([
		[{lvl1: {lvl2: {lvl3: 123}, sth2: ["test", "string"]}}, true],
		[{lvl1: {lvl2: {lvl3: "123"}, sth2: ["test", "string"]}}, false],
		[{lvl1: {lvl2: {lvl3: 123}}}, false],
	])("object", (raw: UserData, result: boolean) => {
		const shouldBe = {lvl1: {lvl2: {lvl3: Is.int}, sth2: Is.array(Of.strings)}};
		check(raw, result, shouldBe);
	});

	test.each([
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5}]}, true],
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5.5}]}, true],
		[{diffs: [{x: 7, y: 4}, {x: 10, z: 5}]}, false],
	])("vectors", (raw: UserData, result: boolean) => {
		const shouldBe = {diffs: Is.array(Of.vec2fs)};
		check(raw, result, shouldBe);

		if (result) {
			const first = (raw.diffs as any)[0];
			expect(first instanceof Vector2).toBeTruthy();
			expect(first.x).toBe(7);
			expect(first.y).toBe(4);
		}
	});

	test.each([
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5}]}, true],
		[{diffs: [{x: 7, y: 4}, {x: 10, y: 5.5}]}, false],
		[{diffs: [{x: 7, y: 4}, {x: 10, z: 5}]}, false],
	])("int vectors", (raw: UserData, result: boolean) => {
		const shouldBe = {diffs: Is.array(Of.vec2is)};
		check(raw, result, shouldBe);

		if (result) {
			const second = (raw.diffs as {x: number, y: number}[])[1];
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
});