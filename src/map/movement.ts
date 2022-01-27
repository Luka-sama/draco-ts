import {OnlyLogged} from "../auth/auth.decorator";
import {assert, ensure, Is} from "../validation";
import WS, {LoggedArgs} from "../ws";
import Zone from "./zone";

export default class Movement {
	@OnlyLogged()
	async move({user, raw}: LoggedArgs) {
		const diff = ensure(raw, Is.vec2i);
		assert(Math.abs(diff.x) <= 1 && Math.abs(diff.y) <= 1);

		const oldZone = await Zone.getByUser(user);
		user.position = user.position.add(diff);
		const newZone = await Zone.getByUser(user);
		if (oldZone != newZone) {
			oldZone.leave(user);
			await newZone.enter(user);
			await newZone.emitAll(user);
		}

		await newZone.emitToAll("move", WS.prepare(user, ["id", "position"]));
	}
}