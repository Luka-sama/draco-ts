import assert from "assert/strict";
import {afterEach, before, beforeEach, mock, test} from "node:test";
import GameLoop from "./game-loop.js";
import Task from "./task.js";

const frequency = 16;
const logError = mock.method(GameLoop["logger"], "error");
before(() => {
	logError.mock.mockImplementation(() => {});
	mock.timers.enable();
});
beforeEach(() => {
	logError.mock.resetCalls();
	GameLoop.init(frequency);
});
afterEach(() => {
	GameLoop.stop();
});

async function advanceTimers(ms: number): Promise<void> {
	for (let i = 0; i < ms; i++) {
		mock.timers.tick(1);
		await new Promise(process.nextTick);
	}
}

test("single task with limited execution count", async () => {
	let counter = 0;
	Task.create(() => {
		counter++;
	}, {executionCount: 2});

	await advanceTimers(frequency);
	assert.equal(counter, 1);
	await advanceTimers(frequency);
	assert.equal(counter, 2);
	await advanceTimers(5 * frequency);
	assert.equal(counter, 2);
});

test("slow and fast task in parallel", async () => {
	const taskDuration = 100;
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

	await advanceTimers(3 * frequency);
	assert.equal(slowTaskCounter, 0);
	assert.equal(slowTaskInstanceCount, 1);
	assert.equal(fastTaskCounter, 3);

	await advanceTimers(taskDuration);
	assert.equal(slowTaskCounter, 1);
	assert(slowTaskInstanceCount <= 1);
	assert.equal(fastTaskCounter, Math.floor(3 + taskDuration / frequency));

	await advanceTimers(taskDuration);
	assert.equal(slowTaskCounter, 2);
	assert(slowTaskInstanceCount <= 1);
	assert.equal(fastTaskCounter, Math.floor(3 + 2 * taskDuration / frequency));

	slowTask.stop();
	fastTask.stop();
	await advanceTimers(3 * taskDuration);
	assert.equal(slowTaskCounter, 3);
	assert.equal(slowTaskInstanceCount, 0);
	assert.equal(fastTaskCounter, Math.floor(3 + 2 * taskDuration / frequency));
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

	await advanceTimers(3 * frequency);
	assert.equal(taskWithErrorCounter, 3);
	assert.equal(taskWithoutErrorCounter, 3);
	assert.equal(logError.mock.callCount(), 3);
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

	await advanceTimers(4 * frequency);
	assert.equal(taskWithErrorCounter, 4);
	assert.equal(taskWithoutErrorCounter, 4);
	assert.equal(logError.mock.callCount(), 4);
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

	await advanceTimers(4 * frequency + 2);
	assert.equal(fastTaskDeltaSum, 4 * frequency);
	assert.equal(slowTaskDeltaSum, frequency);

	await advanceTimers(slowTaskDuration);
	assert.equal(slowTaskDeltaSum, frequency + Math.ceil(slowTaskDuration / frequency) * frequency);

	await advanceTimers(slowTaskDuration);
	assert.equal(slowTaskDeltaSum, frequency + 2 * Math.ceil(slowTaskDuration / frequency) * frequency);
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

	await advanceTimers(frequency);
	assert.deepEqual(result, [1, 2, 3]);
});