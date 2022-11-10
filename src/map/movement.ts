import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator";
import {ensure, Is} from "../core/validation";
import {LoggedArgs} from "../core/ws.typings";

/** This class handles movement of players */
export default class Movement {
	/** The user moves by one tile */
	@OnlyLogged()
	static move({user, raw}: LoggedArgs): void {
		const diff = ensure(raw, Is.vec2i);
		assert(Math.abs(diff.x) <= 1 && Math.abs(diff.y) <= 1);
		user.position = user.position.add(diff);
	}
}