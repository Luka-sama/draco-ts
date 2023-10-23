import _ from "lodash";
import Logger from "./util/logger.js";

/** A function that can be a task in game loop */
export type TaskFunction = (delta: number) => void | Promise<void>;
/** An object that contains the information about the task */
export interface Task {
	taskFunction: TaskFunction,
	frequency: number,
	lastExecution: number,
	remainingExecutions: number,
}

/**
 * Game loop class.
 * It can be used to add tasks that should be repeated periodically or that should be delayed and executed limited number of times.
 */
export default class GameLoop {
	/** How often the game loop is executed */
	private static readonly logger = new Logger(GameLoop);
	private static readonly tasks: Task[] = [];
	private static tick = 0;
	private static interval?: NodeJS.Timer;

	/** Initializes the game loop */
	public static init(frequency: number): void {
		if (!GameLoop.interval) {
			GameLoop.interval = setInterval(GameLoop.execAllTasks, frequency);
		}
	}

	/** Stops the game loop */
	public static stop(): void {
		if (GameLoop.interval) {
			clearInterval(GameLoop.interval);
			delete GameLoop.interval;
		}
		GameLoop.tasks.length = 0;
		GameLoop.tick = 0;
	}

	/** Returns how many ticks have passed since start, e.g. 2 ticks mean that all tasks were executed twice */
	public static getTick(): number {
		return GameLoop.tick;
	}

	/**
	 * Adds task to the list of executed tasks.
	 * If `frequency` is not specified, the task is executed in each game loop iteration.
	 * If `executionCount` is not specified, the task is executed infinitely. With `executionCount` 1 the task is a timeout.
	 */
	public static addTask(taskFunction: TaskFunction, frequency = 0, executionCount = Infinity): Task {
		const task: Task = {taskFunction, frequency, lastExecution: Date.now(), remainingExecutions: executionCount};
		GameLoop.tasks.push(task);
		const name = taskFunction.name || "An anonymous function";
		GameLoop.logger.info(
			`${name} was added to tasks with frequency ${frequency}` +
			(executionCount != Infinity ? ` and execution count ${executionCount}.` : ".")
		);
		return task;
	}

	/** Shortcut for {@link GameLoop.addTask} with `executionCount` 1 */
	public static addTimeout(taskFunction: TaskFunction, ms: number): Task {
		return GameLoop.addTask(taskFunction, ms, 1);
	}

	/** Removes task from the list of executed tasks */
	public static removeTask(task: Task): void {
		_.pull(GameLoop.tasks, task);
		GameLoop.logger.info(`${task.taskFunction.name || "An anonymous function"} was removed from tasks.`);
	}

	/** Executes all tasks during a loop iteration */
	private static async execAllTasks(): Promise<void> {
		GameLoop.tick++;
		await Promise.allSettled(
			GameLoop.tasks.map(GameLoop.execTask)
		);
	}

	/** Executes a task during a loop iteration */
	private static execTask(task: Task): void | Promise<void> {
		const now = Date.now();
		const delta = now - task.lastExecution;
		if (delta < task.frequency) {
			return;
		}

		task.lastExecution = Infinity; // Task locking, prevents the simultaneous execution of two identical tasks
		GameLoop.logger.debug(`${task.taskFunction.name || "An anonymous function"} starts executing.`);
		try {
			const result = task.taskFunction(delta);
			if (result) {
				return result.catch(GameLoop.logger.error).finally(() => GameLoop.onTaskEnd(task, now));
			} else {
				GameLoop.onTaskEnd(task, now);
			}
		} catch(e) {
			GameLoop.logger.error(e);
			GameLoop.onTaskEnd(task, now);
		}
	}

	/** The function that is executed at the end of each task */
	private static onTaskEnd(task: Task, now: number): void {
		task.lastExecution = now;
		task.remainingExecutions--;
		if (task.remainingExecutions < 1) {
			GameLoop.removeTask(task);
		}
		GameLoop.logger.debug(`${task.taskFunction.name || "An anonymous function"} ends executing.`);
	}
}