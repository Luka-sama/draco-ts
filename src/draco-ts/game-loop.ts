import _ from "lodash";
import {EndOfRequest} from "./limit.js";

export type TaskFunction = (delta: number) => void | Promise<void>;
export interface Task {
	task: TaskFunction,
	frequency: number,
	lastExecution: number,
}

export default class GameLoop {
	/** How often the game loop is executed */
	private static readonly FREQUENCY = 16;
	private static tasks: Task[] = [];

	/** Initializes game loop */
	static init() {
		setInterval(GameLoop.exec, GameLoop.FREQUENCY).unref();
	}

	/** Adds task to the list of executed tasks. If `frequency` is not specified, the task is executed in each game loop iteration */
	static addTask(taskFunction: TaskFunction, frequency = 0): Task {
		const task: Task = {task: taskFunction, frequency, lastExecution: Date.now()};
		GameLoop.tasks.push(task);
		return task;
	}

	static removeTask(task: Task): void {
		_.pull(GameLoop.tasks, task);
	}

	private static async exec(): Promise<void> {
		const now = Date.now();
		const promises = [];

		for (const task of GameLoop.tasks) {
			const delta = now - task.lastExecution;
			if (delta >= task.frequency) {
				task.lastExecution = Infinity; // Task locking, prevents the simultaneous execution of two identical tasks
				const promise = Promise.resolve(task.task(delta)).catch(e => {
					if (!(e instanceof EndOfRequest) && (e as any)?.code != "ABORT_ERR") {
						console.error(e);
					}
				}).finally(() => {
					task.lastExecution = now;
				});
				promises.push(promise);
			}
		}

		await Promise.allSettled(promises);
	}
}