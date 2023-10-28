import GameLoop from "./game-loop.js";
import Task from "./task.js";

const frequency = 16;
const logError = jest.spyOn(GameLoop["logger"], "error").mockImplementation();
beforeEach(() => {
	jest.useFakeTimers();
	GameLoop.init(frequency);
});
afterEach(() => {
	GameLoop.stop();
});

test("single task with limited execution count", async () => {
	let counter = 0;
	Task.create(() => {
		counter++;
	}, {executionCount: 2});

	await jest.advanceTimersByTimeAsync(frequency);
	expect(counter).toBe(1);
	await jest.advanceTimersByTimeAsync(frequency);
	expect(counter).toBe(2);
	await jest.advanceTimersByTimeAsync(5 * frequency);
	expect(counter).toBe(2);
});

test("slow and fast task in parallel", async () => {
	const taskDuration = 1000;
	let slowTaskCounter = 0, fastTaskCounter = 0, slowTaskInstanceCount = 0;
	const slowTask = Task.create(() => {
		slowTaskInstanceCount++;
		return new Promise(resolve => {
			setTimeout(() => {
				slowTaskCounter++;
				slowTaskInstanceCount--;
				resolve();
			}, taskDuration);
		});
	});
	const fastTask = Task.create(() => {
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

	slowTask.stop();
	fastTask.stop();
	await jest.advanceTimersByTimeAsync(3 * taskDuration);
	expect(slowTaskCounter).toBe(3);
	expect(slowTaskInstanceCount).toBe(0);
	expect(fastTaskCounter).toBe(Math.floor(2 + 2 * taskDuration / frequency));
});

test("task with error", async () => {
	let taskWithErrorCounter = 0;
	let taskWithoutErrorCounter = 0;
	Task.create(() => {
		taskWithErrorCounter++;
		throw new Error("some error");
	});
	Task.create(() => {
		taskWithoutErrorCounter++;
	});

	await jest.advanceTimersByTimeAsync(3 * frequency);
	expect(taskWithErrorCounter).toBe(3);
	expect(taskWithoutErrorCounter).toBe(3);
	expect(logError).toHaveBeenCalledTimes(3);
});

test("async task with error", async () => {
	let taskWithErrorCounter = 0;
	let taskWithoutErrorCounter = 0;
	Task.create(() => {
		taskWithErrorCounter++;
		return new Promise((resolve, reject) => {
			reject("some error");
		});
	});
	Task.create(() => {
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
	Task.create(delta => {
		fastTaskDeltaSum += delta;
	});
	Task.create(delta => {
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

test("priorities", async () => {
	const result: number[] = [];
	Task.create(() => {
		result.push(2);
	}, {priority: 2});
	Task.create(() => {
		result.push(1);
	}, {priority: 1});
	Task.create(() => {
		result.push(3);
	}, {priority: 3});

	await jest.advanceTimersByTimeAsync(frequency);
	expect(result).toStrictEqual([1, 2, 3]);
});