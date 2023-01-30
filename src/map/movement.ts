import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator.js";
import Helper from "../core/helper.js";
import {ensure, Is} from "../core/validation.js";
import {LoggedArgs} from "../core/ws.typings.js";
import Const from "../math/const.js";
import {Vec2} from "../math/vector.embeddable.js";

/** This class handles movement of players */
export default class Movement {
	/** The user moves by one tile */
	@OnlyLogged()
	static async move({raw, user, zone}: LoggedArgs): Promise<void> {
		const {direction, run} = ensure(raw, {direction: Is.vec2i, run: Is.bool});
		assert(Math.abs(direction.x) <= 1 && Math.abs(direction.y) <= 1 && (direction.x != 0 || direction.y != 0));

		const speed = (run ? Const.MOVEMENT_RUN_SPEED : Const.MOVEMENT_WALK_SPEED);
		await Helper.softLimitBySpeed("Movement.move", user, speed);

		const possibleDirections = [direction];
		// If a not available direction is 1x1, 0x1 should be preferred over -1x1 (if possible)
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
			if (newPosition.x > 0 && newPosition.y > 0 && zone.hasTile(newPosition) && zone.isTileFree(newPosition)) {
				Helper.updateLastTime("Movement.move", user);
				user.position = newPosition;
				user.speed = speed;
				return;
			}
		}
	}
}