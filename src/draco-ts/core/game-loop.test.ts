import GameLoop from "./game-loop.js";

const frequency = 16;
const logError = jest.spyOn(GameLoop["logger"], "error").mockImplementation();
beforeEach(() => {
	jest.useFakeTimers();
	GameLoop.init(frequency);
});
afterEach(() => {
	GameLoop.stop();
});

test("single task with limited execution count", () => {
	let counter = 0;
	GameLoop.addTask(() => {
		counter++;
	}, 0, 2);

	jest.advanceTimersByTime(frequency);
	expect(counter).toBe(1);
	jest.advanceTimersByTime(frequency);
	expect(counter).toBe(2);
	jest.advanceTimersByTime(5 * frequency);
	expect(counter).toBe(2);
});

test("slow and fast task in parallel", async () => {
	const taskDuration = 1000;
	let slowTaskCounter = 0, fastTaskCounter = 0, slowTaskInstanceCount = 0;
	const slowTask = GameLoop.addTask(() => {
		slowTaskInstanceCount++;
		return new Promise(resolve => {
			setTimeout(() => {
				slowTaskCounter++;
				slowTaskInstanceCount--;
				resolve();
			}, taskDuration);
		});
	});
	const fastTask = GameLoop.addTask(() => {
		fastTaskCounter++;
	});

	await jest.advanceTimersByTimeAsync(2 * frequency);
	expect(slowTaskCounter).toBe(0);
	expect(slowTaskInstanceCount).toBe(1);
	expect(fastTaskCounter).toBe(2);

	await jest.advanceTimersByTimeAsync(taskDuration);
	expect(slowTaskCounter).toBe(1);
	expect(slowTaskInstanceCount).toBeLessThanOrEqual(1);
	expect(fastTaskCounter).toBe(Math.floor(2 + taskDuration / frequency));

	await jest.advanceTimersByTimeAsync(taskDuration);
	expect(slowTaskCounter).toBe(2);
	expect(slowTaskInstanceCount).toBeLessThanOrEqual(1);
	expect(fastTaskCounter).toBe(Math.floor(2 + 2 * taskDuration / frequency));

	GameLoop.removeTask(slowTask);
	GameLoop.removeTask(fastTask);
	await jest.advanceTimersByTimeAsync(3 * taskDuration);
	expect(slowTaskCounter).toBe(3);
	expect(slowTaskInstanceCount).toBe(0);
	expect(fastTaskCounter).toBe(Math.floor(2 + 2 * taskDuration / frequency));
});

test("task with error", () => {
	let taskWithErrorCounter = 0;
	let taskWithoutErrorCounter = 0;
	GameLoop.addTask(() => {
		taskWithErrorCounter++;
		throw new Error("some error");
	});
	GameLoop.addTask(() => {
		taskWithoutErrorCounter++;
	});

	jest.advanceTimersByTime(3 * frequency);
	expect(taskWithErrorCounter).toBe(3);
	expect(taskWithoutErrorCounter).toBe(3);
	expect(logError).toHaveBeenCalledTimes(3);
});

test("async task with error", async () => {
	let taskWithErrorCounter = 0;
	let taskWithoutErrorCounter = 0;
	GameLoop.addTask(() => {
		taskWithErrorCounter++;
		return new Promise((resolve, reject) => {
			reject("some error");
		});
	});
	GameLoop.addTask(() => {
		taskWithoutErrorCounter++;
	});

	await jest.advanceTimersByTimeAsync(4 * frequency);
	expect(taskWithErrorCounter).toBe(4);
	expect(taskWithoutErrorCounter).toBe(4);
	expect(logError).toHaveBeenCalledTimes(4);
});

test("using delta", async () => {
	let fastTaskDeltaSum = 0, slowTaskDeltaSum = 0;
	const slowTaskDuration = 100;
	GameLoop.addTask(delta => {
		fastTaskDeltaSum += delta;
	});
	GameLoop.addTask(delta => {
		slowTaskDeltaSum += delta;
		return new Promise(resolve => setTimeout(resolve, slowTaskDuration));
	});

	await jest.advanceTimersByTimeAsync(4 * frequency + 2);
	expect(fastTaskDeltaSum).toBe(4 * frequency);
	expect(slowTaskDeltaSum).toBe(frequency);

	await jest.advanceTimersByTimeAsync(slowTaskDuration);
	expect(slowTaskDeltaSum).toBe(frequency + Math.ceil(slowTaskDuration / frequency) * frequency);

	await jest.advanceTimersByTimeAsync(slowTaskDuration);
	expect(slowTaskDeltaSum).toBe(frequency + 2 * Math.ceil(slowTaskDuration / frequency) * frequency);
});