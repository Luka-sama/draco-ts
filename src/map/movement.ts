import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator";
import User from "../auth/user.entity";
import {ensure, Is} from "../core/validation";
import {LoggedArgs} from "../core/ws.typings";
import Const from "../math/const";

/** This class handles movement of players */
export default class Movement {
	/** Saved time of last movement */
	private static lastTime = new WeakMap<User, number>();
	/**
	 * If the user moves too often, only one last movement will be processed - with a delay, so that the speed is not exceeded.
	 * Timers for such moves are saved in this map.
	 */
	private static timers = new WeakMap<User, NodeJS.Timeout>();

	/** The user moves by one tile */
	@OnlyLogged()
	static move(args: LoggedArgs): void {
		const {user, zone} = args;
		const direction = ensure(args.raw, Is.vec2i);
		assert(Math.abs(direction.x) <= 1 && Math.abs(direction.y) <= 1 && (direction.x != 0 || direction.y != 0));

		const last = Movement.lastTime.get(user) || 0;
		const passed = Date.now() - last;
		const frequency = 1000 / Const.MOVEMENT_WALK_SPEED;
		if (passed >= frequency) {
			const newPosition = user.position.add(direction);
			if (zone.isTileFree(newPosition)) {
				user.position = newPosition;
				Movement.lastTime.set(user, Date.now());
			}
		} else {
			const oldTimer = Movement.timers.get(user);
			if (oldTimer) {
				clearTimeout(oldTimer);
			}
			const timer = setTimeout(() => {
				Movement.timers.delete(user);
				Movement.move(args);
			}, frequency - passed).unref();
			Movement.timers.set(user, timer);
		}
	}
}