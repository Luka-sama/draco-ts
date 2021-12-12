import {ensure, Is, Of, WrongDataError} from "./validation";
import {UserData} from "./ws";

describe("ensure", () => {
	test("simple object", () => {
		const shouldBe = {name: Is.string, count: Is.number, flag: Is.bool};

		const correctObj = {name: "test", count: 123, flag: false};
		expect(ensure(correctObj as UserData, shouldBe)).toBe(correctObj);

		const wrongObjs = [
			{name: "test", count: "123", flag: false},
			{name: "test", count: 123, flag: false, extraKey: true},
			{name: "test", flag: false}
		];
		for (const wrongObj of wrongObjs) {
			expect(() => ensure(wrongObj as UserData, shouldBe)).toThrow(WrongDataError);
		}
	});

	test("array", () => {
		const shouldBe = {ids: Is.array(Of.numbers)};

		const correctObjs = [
			{ids: [1, 2, 3]},
			{ids: []}
		];
		for (const correctObj of correctObjs) {
			expect(ensure(correctObj as UserData, shouldBe)).toBe(correctObj);
		}

		const wrongObjs = [
			{ids: [1, "2", 3]},
			{ids: {}}
		];
		for (const wrongObj of wrongObjs) {
			expect(() => ensure(wrongObj as UserData, shouldBe)).toThrow(WrongDataError);
		}
	});

	test("array of arrays", () => {
		const shouldBe = {ids: Is.array(Of.arrays(Of.numbers))};

		const correctObjs = [
			{ids: [[1, 2, 3], [2, 3, 4], [10, 20, 30]]},
			{ids: []}
		];
		for (const correctObj of correctObjs) {
			expect(ensure(correctObj as UserData, shouldBe)).toBe(correctObj);
		}

		const wrongObjs = [
			{ids: [[1, 2, 3], [2, 3, 4], [10, "20", 30]]},
			{ids: [undefined, [1, 2, 3]]},
			{ids: [[1, 2, 3], 4]}
		];
		for (const wrongObj of wrongObjs) {
			expect(() => ensure(wrongObj as UserData, shouldBe)).toThrow(WrongDataError);
		}
	});

	test("object", () => {
		const shouldBe = {lvl1: {lvl2: {lvl3: Is.number}, sth2: Is.array(Of.strings)}};

		const correctObj = {lvl1: {lvl2: {lvl3: 123}, sth2: ["test", "string"]}};
		expect(ensure(correctObj as UserData, shouldBe)).toBe(correctObj);

		const wrongObjs = [
			{lvl1: {lvl2: {lvl3: "123"}, sth2: ["test", "string"]}},
			{lvl1: {lvl2: {lvl3: 123}}}
		];
		for (const wrongObj of wrongObjs) {
			expect(() => ensure(wrongObj as UserData, shouldBe)).toThrow(WrongDataError);
		}
	});
});