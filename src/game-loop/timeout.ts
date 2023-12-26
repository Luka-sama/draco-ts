import Task, {TaskFunction, TaskParameters} from "./task.js";

/** A task with the execution count equal to 1 */
export default class Timeout extends Task {
	public constructor(run: TaskFunction, ms: number, params: Omit<TaskParameters, "frequency"> = {}) {
		super(run, {frequency: ms, ...params});
	}
}