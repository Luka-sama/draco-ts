import assert from "assert/strict";
import {Constructor} from "../typings.js";
import GameLoop from "./game-loop.js";

/** A function that can be a task in the game loop */
export type TaskFunction = (delta: number, data: any) => void | Promise<void>;

export interface TaskParameters {
	/** If not specified, the function name will be used */
	name?: string;
	/** If `frequency` is not specified, the task is executed in each game loop iteration */
	frequency?: number;
	/**
	 * If `executionCount` is not specified, the task is executed infinitely.
	 * With `executionCount` 1 the task is a timeout
	 */
	executionCount?: number;
	/** Any data that will be passed to the task function */
	data?: any;
	/**
	 * The higher the priority value, the later the task will be executed during a game loop iteration.
	 * Tasks with the same priority are executed in parallel at the same time.
	 * The default priority is 0, so e.g. -1 means that the task will be executed before most other tasks,
	 * and 1 means that it will be executed after most other tasks.
	 */
	priority?: number;
}

/**
 * Task class. A task can be repeated periodically or can be delayed and executed limited number of times.
 * See also {@link TaskParameters} for parameter details.
 */
export default class Task {
	/**
	 * You can pass this constant instead of a function to constructor
	 * to use the overwritten ´run` method from your child class
	 */
	public static readonly USE_RUN_METHOD = () => {};
	public readonly name: string;
	public frequency: number;
	public remainingExecutions: number;
	/** The creation time as a unixtime timestamp, in milliseconds */
	public readonly createdAt = Date.now();
	/** The start time as a unixtime timestamp, in milliseconds. It is updated with each call of {@link Task.start} */
	public startedAt = Date.now();
	protected data: any;
	private lastExecution: number;
	private priority: number;

	/** A shortcut that creates a task using {@link Task.constructor} and then starts it with {@link Task.start} */
	public static create<T extends Constructor<Task>>(this: T, ...args: ConstructorParameters<T>): InstanceType<T> {
		const task = new this(...args) as InstanceType<T>;
		task.start();
		return task;
	}

	/**
	 * Task constructor. Use then {@link Task.start} to start the task or use the shortcut {@link Task.create} directly.
	 * See {@link TaskParameters} for parameter details. You can also use the constant {@link Task.USE_RUN_METHOD}.
	 */
	public constructor(run: TaskFunction, params: TaskParameters = {}) {
		if (run != Task.USE_RUN_METHOD) {
			this.run = run;
		}
		this.name = params.name || run.name || "An anonymous function";
		this.frequency = params.frequency ?? 0;
		this.remainingExecutions = params.executionCount ?? Infinity;
		this.data = params.data;
		this.lastExecution = Date.now();
		this.priority = params.priority ?? 0;
		assert(Number.isInteger(this.priority));
	}

	/** Starts task execution */
	public start(): void {
		GameLoop.addTask(this);
	}

	/** Stops task execution. Use then {@link Task.start} to resume the task if necessary */
	public stop(): void {
		GameLoop.removeTask(this);
	}

	/** Returns the priority of this task */
	public getPriority(): number {
		return this.priority;
	}

	/** Updates the priority of this task */
	public setPriority(priority: number): void {
		assert(Number.isInteger(priority));
		this.stop();
		this.priority = priority;
		this.start();
	}

	/**
	 * Executes a task during a loop iteration
	 * @internal
	 */
	public step(): void | Promise<void> {
		const now = Date.now();
		const delta = now - this.lastExecution;
		if (delta < this.frequency) {
			return;
		}

		this.lastExecution = Infinity; // Task locking, prevents the simultaneous execution of two identical tasks
		GameLoop.logger.debug(`${this.name} starts executing.`);
		try {
			const result = this.run(delta, this.data);
			if (result) {
				return result.catch(GameLoop.logger.error).finally(() => this.onEnd(now));
			} else {
				this.onEnd(now);
			}
		} catch (e) {
			GameLoop.logger.error(e);
			this.onEnd(now);
		}
	}

	/**
	 * Here should be a implementation of the task – either overwritten in the child class
	 * or replaced with a function passed to the constructor
	 */
	protected run(delta: number, data: any): void | Promise<void> {
		GameLoop.logger.warn(`No task implementation for ${this.name} provided.`);
	}

	/** This method is called after each task execution */
	private onEnd(now: number): void {
		this.lastExecution = now;
		this.remainingExecutions--;
		if (this.remainingExecutions < 1) {
			this.stop();
		}
		GameLoop.logger.debug(`${this.name} ends executing.`);
	}
}