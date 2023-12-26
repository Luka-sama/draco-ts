import MapUtil from "../collection-utils/map-util.js";
import Logger from "../logger.js";
import Task from "./task.js";

/** Game loop class. Manages and executes tasks, see {@link Task} */
export default class GameLoop {
	public static readonly logger = new Logger(GameLoop);
	private static readonly tasks = new Map<number, Set<Task>>;
	private static tick = 0;
	private static interval?: NodeJS.Timeout;

	/** Initializes the game loop */
	public static init(frequency: number): void {
		if (!GameLoop.interval) {
			GameLoop.interval = setInterval(GameLoop.step, frequency);
		}
	}

	/** Stops the game loop */
	public static stop(): void {
		if (GameLoop.interval) {
			clearInterval(GameLoop.interval);
			delete GameLoop.interval;
		}
		GameLoop.tasks.clear();
		GameLoop.tick = 0;
	}

	/** Returns how many ticks have passed since start, e.g. 2 ticks mean that all tasks were executed twice */
	public static getTick(): number {
		return GameLoop.tick;
	}

	/** Adds the task to the list of executed tasks */
	public static addTask(task: Task): void {
		const taskSet = MapUtil.getSet(GameLoop.tasks, task.getPriority());
		if (taskSet.has(task)) {
			GameLoop.logger.warn(`Tried to add task "${task.name}" that is already added.`);
		} else {
			taskSet.add(task);
			task.startedAt = Date.now();
			GameLoop.logger.info(
				`${task.name} was added to tasks with frequency ${task.frequency}` +
				(task.remainingExecutions != Infinity ? ` and execution count ${task.remainingExecutions}.` : ".")
			);
		}
	}

	/** Removes the task from the list of executed tasks */
	public static removeTask(task: Task): void {
		const taskSet = MapUtil.getSet(GameLoop.tasks, task.getPriority());
		if (taskSet.delete(task)) {
			GameLoop.logger.info(`${task.name} was removed from tasks.`);
		} else {
			GameLoop.logger.warn(`Tried to remove task "${task.name}" that is already removed or was not added.`);
		}
	}

	/** Executes all tasks during a loop iteration */
	private static async step(): Promise<void> {
		GameLoop.tick++;

		const priorities = Array.from(GameLoop.tasks.keys()).sort((a, b) => a - b);
		for (const priority of priorities) {
			const taskSet = MapUtil.getSet(GameLoop.tasks, priority);
			if (taskSet.size < 1) {
				GameLoop.tasks.delete(priority);
				continue;
			}

			const promises: Promise<void>[] = [];
			taskSet.forEach(task => promises.push(task._step()));
			await Promise.allSettled(promises);
		}
	}
}