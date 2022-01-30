import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator";
import {ensure, Is} from "../validation";
import {LoggedArgs} from "../ws";

export default class Movement {
	@OnlyLogged()
	move({user, raw}: LoggedArgs): void {
		const diff = ensure(raw, Is.vec2i);
		assert(Math.abs(diff.x) <= 1 && Math.abs(diff.y) <= 1);
		user.position = user.position.add(diff);
	}
}