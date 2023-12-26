import GameLoop from "./game-loop.js";
import Task, {TaskParameters} from "./task.js";

/**
 * A task that exists as long as the given object exists in the memory
 * A common use would be e.g. to put in such task the algorithm for a bot.
 * The bot would move and do something as long as someone is online nearby.
 * When there is no one left online nearby, the task will be stopped to save server resources.
 *
 * It is recommended to name such files `*.task.ts`, e.g. `bot.task.ts`.
 *
 * Example of use:
 * ```ts
 * export default class BotTask extends WeakTask<Bot> {
 *   protected run(delta: number, bot: Bot) {
 *     // do something
 *   }
 * }
 * ```
 */
export default abstract class WeakTask<T extends object> extends Task {
	protected data: WeakRef<T> | T;

	public constructor(object: T, params: TaskParameters = {}) {
		super(Task.USE_RUN_METHOD, params);
		this.data = new WeakRef(object);
	}

	public async _step(): Promise<void> {
		const ref = this.data;
		if (!(ref instanceof WeakRef)) {
			GameLoop.logger.error(`${this.name}: data is not WeakRef.`);
			this.stop();
			return;
		}

		const value = ref.deref();
		if (value) {
			this.data = value;
			await super._step();
			this.data = ref;
		} else {
			this.stop();
		}
	}

	/** Here should be a implementation of the task */
	protected abstract run(delta: number, object: T): void | Promise<void>;
}