import assert from "assert/strict";
import {LoggedArgs, OnlyLogged} from "../auth/auth.decorator.js";
import Limit from "../draco-ts/limit.js";
import {ensure, Is} from "../draco-ts/util/validation.js";
import {Vec2} from "../draco-ts/util/vector.js";

/** This class handles movement of players */
export default class Movement {
	/** Walk speed (tiles per second) */
	public static readonly WALK_SPEED = 7;
	/** Run speed (tiles per second) */
	public static readonly RUN_SPEED = 15;

	/** The user moves by one tile */
	@OnlyLogged()
	static async move({raw, user, zone}: LoggedArgs): Promise<void> {
		const {direction, run} = ensure(raw, {direction: Is.vec2i, run: Is.bool});
		assert(Math.abs(direction.x) <= 1 && Math.abs(direction.y) <= 1 && (direction.x != 0 || direction.y != 0));

		const speed = (run ? Movement.RUN_SPEED : Movement.WALK_SPEED);
		await Limit.softBySpeed(this, user, speed);

		const possibleDirections = [direction];
		// If direction 1x1 is not available, 0x1 should be preferred over -1x1 (if possible)
		for (const i of [0, -1, 1]) {
			if (direction.x != 0) {
				possibleDirections.push(Vec2(direction.x, i));
			}
			if (direction.y != 0) {
				possibleDirections.push(Vec2(i, direction.y));
			}
		}
		for (const possibleDirection of possibleDirections) {
			const newPosition = user.position.add(possibleDirection.toStaggered());
			// In the first row/column only the half of the user is visible, so it is forbidden to go there
			const isFirstRowOrColumn = !zone.hasTile(newPosition.sub(Vec2(1, 1)));
			if (!isFirstRowOrColumn && zone.hasTile(newPosition) && zone.isTileFree(newPosition)) {
				Limit.updateLastTime(this, user);
				user.position = newPosition;
				user.speed = speed;
				for (const item of user.items.getItems()) {
					item.position = newPosition;
				}
				return;
			}
		}
	}
}