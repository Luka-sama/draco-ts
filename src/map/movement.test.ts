import assert from "assert/strict";
import {Vec2} from "../math/vector.embeddable";
import Movement from "./movement";

describe("move", () => {
	test("with cheating", async() => {
		await expect(() => Movement.move({...loggedArgs, raw: {x: 1, y: 2}}) ).rejects.toThrow(assert.AssertionError);
	});

	test("normal", () => {
		const oldPosition = user.position;
		Movement.move({...loggedArgs, raw: {x: 1, y: 0}});
		const newPosition = user.position;
		expect(oldPosition.add(Vec2(1, 0)).equals(newPosition)).toBeTruthy();
	});
});