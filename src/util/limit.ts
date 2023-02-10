import {setTimeout} from "timers/promises";
import User from "../auth/user.entity.js";
import Tr from "../core/tr.js";
import {Socket} from "../core/ws.typings.js";
import MapUtil from "./map-util.js";

/**
 * WeakMap that stores the time of the last execution of an action for each user
 * @internal
 */
export type LastTimeMap = WeakMap<User | Socket, number>;
/**
 * WeakMap that stores abort controllers that can be used to cancel the timers (of the delayed actions)
 * @internal
 */
export type Timers = WeakMap<User | Socket, AbortController>;

/** This error can be thrown if the request should be ended. This will be handled not as en error, but as a normal end of execution */
export class EndOfRequest extends Error {
	constructor() {
		super();
		this.name = "EndOfRequest";
	}
}

/** This class helps to control the handling of requests, e.g. limit the possible number of requests per second */
export default class Limit {
	/** Saved time of last action */
	private static lastTime = new Map<string, LastTimeMap>();
	/**
	 * If the user e.g. moves too often, only one last movement will be processed - with a delay, so that the speed is not exceeded.
	 * Timers for such moves are saved in this map.
	 */
	private static timers = new Map<string, Timers>();

	/**
	 * Limits action `action` for user `user`: not more often than every `frequency` ms.
	 * If the user sends a request too early, this request will be delayed (but not more than one request).
	 * Should be used together with {@link updateLastTime}
	 */
	static async soft(action: string, user: User | Socket, frequency: number): Promise<void> {
		Limit.abortIfRuns(action, user);
		const shouldWait = Limit.getShouldWait(action, user, frequency);
		await Limit.wait(action, user, shouldWait);
	}

	/** Combines {@link soft} and ${@link updateLastTime} */
	static async softUpdatingTime(action: string, user: User | Socket, frequency: number): Promise<void> {
		await Limit.soft(action, user, frequency);
		Limit.updateLastTime(action, user);
	}

	/**
	 * Limits action `action` for user `user`: not more often than `speed` times per second.
	 * If the user sends a request too early, this request will be delayed (but not more than one request).
	 * Should be used together with {@link updateLastTime}
	 */
	static async softBySpeed(action: string, user: User | Socket, speed: number): Promise<void> {
		const frequency = 1000 / speed;
		return await Limit.soft(action, user, frequency);
	}

	/**
	 * Limits action `action` for user `user`: not more often than every `frequency` ms.
	 * If the user sends a request too early, this request will be rejected with error `errorText`.
	 * Should be used together with {@link updateLastTime} (or use {@link strictUpdatingTime} instead)
	 */
	static strict(action: string, user: User | Socket, frequency: number, errorText = Tr.get("LIMIT_REACHED")): void {
		const shouldWait = Limit.getShouldWait(action, user, frequency);
		if (shouldWait > 0) {
			if (errorText) {
				user.info(errorText);
			}
			throw new EndOfRequest;
		}
	}

	static strictBySpeed(action: string, user: User | Socket, speed: number): void {
		const frequency = 1000 / speed;
		return Limit.strict(action, user, frequency, "");
	}

	/** Combines {@link strict} and ${@link updateLastTime} */
	static strictUpdatingTime(action: string, user: User | Socket, frequency: number, errorText?: string): void {
		Limit.strict(action, user, frequency, errorText);
		Limit.updateLastTime(action, user);
	}

	/** Updates last time of an `action` for the given `user` */
	static updateLastTime(action: string, user: User | Socket): void {
		MapUtil.getWeakMap(Limit.lastTime, action).set(user, Date.now());
	}

	/** Waits for `shouldWait` ms for the action `action` by `user` */
	private static async wait(action: string, user: User | Socket, shouldWait: number): Promise<void> {
		if (shouldWait > 0) {
			const timers = MapUtil.getWeakMap(Limit.timers, action);
			const abort = new AbortController();
			timers.set(user, abort);
			await setTimeout(shouldWait, undefined, {ref: false, signal: abort.signal});
			timers.delete(user);
		}
	}

	/** Aborts a task if it runs */
	private static abortIfRuns(action: string, user: User | Socket): void {
		const timers = Limit.timers.get(action);
		const deferredTask = (timers && timers.get(user));
		if (deferredTask) {
			deferredTask.abort();
			timers.delete(user);
		}
	}

	/** Returns how long the user should wait before he can execute an action again */
	private static getShouldWait(action: string, user: User | Socket, frequency: number): number {
		if (typeof jest == "object") {
			return 0;
		}
		const lastTimeMap = Limit.lastTime.get(action);
		const last = (lastTimeMap && lastTimeMap.get(user)) || 0;
		const passed = Date.now() - last;
		return frequency - passed;
	}
}