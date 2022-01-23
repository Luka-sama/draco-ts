import {OnlyLogged} from "../auth/auth.decorator";
import {assert, ensure, Is} from "../validation";
import {Vec2} from "../vector.embeddable";
import WS, {EventArgs} from "../ws";
import Zone from "./zone";

export default class Move {
	@OnlyLogged()
	async move({em, user, raw}: EventArgs) {
		const data = ensure(raw, {x: Is.int, y: Is.int});
		assert(Math.abs(data.x) <= 1 && Math.abs(data.y) <= 1);

		const oldZone = await Zone.getByUser(em, user);
		const diff = Vec2(data.x, data.y);
		user.position = user.position.add(diff);
		const newZone = await Zone.getByUser(em, user);
		if (oldZone != newZone) {
			oldZone.leave(user);
			await newZone.enter(em, user);
			await newZone.emitAll(em, user);
		}

		await newZone.pubToAll(em, "move", WS.prepare(user, ["id", "position"]));
	}
}