import {OnlyLogged} from "../auth/auth.decorator";
import {assert, ensure, Is} from "../validation";
import WS, {EventArgs} from "../ws";
import Zone from "./zone";

export default class Movement {
	@OnlyLogged()
	async move({em, user, raw}: EventArgs) {
		const diff = ensure(raw, Is.vec2i);
		assert(Math.abs(diff.x) <= 1 && Math.abs(diff.y) <= 1);

		const oldZone = await Zone.getByUser(em, user);
		user.position = user.position.add(diff);
		const newZone = await Zone.getByUser(em, user);
		if (oldZone != newZone) {
			oldZone.leave(user);
			await newZone.enter(em, user);
			await newZone.emitAll(em, user);
		}

		await newZone.emitToAll(em, "move", WS.prepare(user, ["id", "position"]));
	}
}