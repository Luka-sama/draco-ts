import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator.js";
import {LoggedArgs} from "../core/ws.typings.js";
import Const from "../util/const.js";
import Limit from "../util/limit.js";
import {ensure, Is} from "../util/validation.js";
import {Vec2} from "../util/vector.embeddable.js";

/** This class handles movement of players */
export default class Movement {
	/** The user moves by one tile */
	@OnlyLogged()
	static async move({raw, user, zone}: LoggedArgs): Promise<void> {
		const {direction, run} = ensure(raw, {direction: Is.vec2i, run: Is.bool});
		assert(Math.abs(direction.x) <= 1 && Math.abs(direction.y) <= 1 && (direction.x != 0 || direction.y != 0));

		const speed = (run ? Const.MOVEMENT_RUN_SPEED : Const.MOVEMENT_WALK_SPEED);
		await Limit.softBySpeed("Movement.move", user, speed);

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
			const newPosition = user.position.add(Vec2(possibleDirection.x, possibleDirection.y * 2));
			// In the first row/column only the half of the user is visible, so it is forbidden to go there
			const isFirstRowOrColumn = !zone.hasTile(newPosition.sub(Vec2(1, 1)));
			if (!isFirstRowOrColumn && zone.hasTile(newPosition) && zone.isTileFree(newPosition)) {
				Limit.updateLastTime("Movement.move", user);
				user.position = newPosition;
				user.speed = speed;
				return;
			}
		}
	}
}