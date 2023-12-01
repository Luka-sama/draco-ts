import assert from "assert/strict";
import {Vec2f} from "../draco-ts/math/vector.js";
import Movement from "./movement.js";

describe("move", () => {
	test("with cheating", async () => {
		const raw = {direction: {x: 1, y: 2}, run: false};
		await expect(() => Movement.move({...loggedArgs, raw}) ).rejects.toThrow(assert.AssertionError);
	});

	test("normal", async () => {
		const oldPosition = user.position;
		const raw = {direction: {x: 1, y: 0}, run: false};
		await Movement.move({...loggedArgs, raw});
		const newPosition = user.position;
		expect(oldPosition.add(Vec2f(1, 0)).equals(newPosition)).toBeTruthy();
	});
});