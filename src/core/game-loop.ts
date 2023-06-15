import _ from "lodash";
import ORM from "../orm/orm.js";
import Const from "../util/const.js";
import {EndOfRequest} from "../util/limit.js";

export type TaskFunction = ((delta: number) => void);
export type Task = {
	task: TaskFunction,
	frequency: number,
	untilNextExecutionLeft: number,
};

export default class GameLoop {
	private static tasks: Task[] = [];
	private static lastExecutionTime = 0;

	static init() {
		setInterval(GameLoop.exec, Const.GAME_LOOP_FREQUENCY_MS).unref();
	}

	/** Adds task to the list of executed tasks. If `frequency` is not specified, the task is executed in each game loop iteration */
	static addTask(taskFunction: TaskFunction, frequency = 0) {
		const task = {task: taskFunction, frequency, untilNextExecutionLeft: frequency};
		GameLoop.tasks.push(task);
		return task;
	}

	static removeTask(task: Task) {
		_.pull(GameLoop.tasks, task);
	}

	private static async exec() {
		const delta = Date.now() - GameLoop.lastExecutionTime;
		for (const task of GameLoop.tasks) {
			task.untilNextExecutionLeft -= delta;
			if (task.untilNextExecutionLeft <= 0) {
				task.untilNextExecutionLeft = Infinity; // Task locking, prevents the simultaneous execution of two identical tasks
				try {
					await task.task(delta);
					await ORM.flush();
				} catch(e) {
					if (!(e instanceof EndOfRequest) && (e as any)?.code != "ABORT_ERR") {
						console.error(e);
					}
				}
				task.untilNextExecutionLeft = task.frequency;
			}
		}
		GameLoop.lastExecutionTime = Date.now();
	}
}