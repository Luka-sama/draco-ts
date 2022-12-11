import assert from "assert/strict";
import {Vec2} from "../math/vector.embeddable";
import Movement from "./movement";

describe("move", () => {
	test("with cheating", async () => {
		const raw = {direction: {x: 1, y: 2}, run: false};
		await expect(() => Movement.move({...loggedArgs, raw}) ).rejects.toThrow(assert.AssertionError);
	});

	test("normal", () => {
		const oldPosition = user.position;
		const raw = {direction: {x: 1, y: 0}, run: false};
		Movement.move({...loggedArgs, raw});
		const newPosition = user.position;
		expect(oldPosition.add(Vec2(1, 0)).equals(newPosition)).toBeTruthy();
	});
});