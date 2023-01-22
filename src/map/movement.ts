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
		for (let i = -1; i <= 1; i++) {
			if (direction.x != 0) {
				possibleDirections.push(Vec2(direction.x, i));
			}
			if (direction.y != 0) {
				possibleDirections.push(Vec2(i, direction.y));
			}
		}
		for (const possibleDirection of possibleDirections) {
			const newPosition = user.position.add(possibleDirection);
			if (zone.isTileFree(newPosition)) {
				Helper.updateLastTime("Movement.move", user);
				user.position = newPosition;
				user.speed = speed;
				return;
			}
		}
	}
}