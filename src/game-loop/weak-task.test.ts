import assert from "assert/strict";
import {afterEach, beforeEach, mock, test} from "node:test";
import GameLoop from "./game-loop.js";
import WeakTask from "./weak-task.js";

const frequency = 16;
mock.timers.enable();
beforeEach(() => {
	GameLoop.init(frequency);
});
afterEach(() => {
	GameLoop.stop();
});

class SomeObject {
	public someProperty = 234;
}

class SomeWeakTask extends WeakTask<SomeObject> {
	public test = 0;

	protected run(_delta: number, object: SomeObject): void {
		this.test = object.someProperty;
	}
}

test("WeakTask", () => {
	const someObject = new SomeObject();
	const weakTask = SomeWeakTask.create(someObject);

	mock.timers.tick(frequency);
	assert.equal(weakTask.test, 234);
});