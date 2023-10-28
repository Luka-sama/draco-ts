import GameLoop from "./game-loop.js";
import WeakTask from "./weak-task.js";

const frequency = 16;
beforeEach(() => {
	jest.useFakeTimers();
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

	protected run(delta: number, object: SomeObject): void {
		this.test = object.someProperty;
	}
}

test("WeakTask", async () => {
	const someObject = new SomeObject();
	const weakTask = SomeWeakTask.create(someObject);

	await jest.advanceTimersByTimeAsync(frequency);
	expect(weakTask.test).toBe(234);
});