import {OnlyLogged} from "../auth/auth.decorator";
import User from "../auth/user.entity";
import {assert, ensure, Is} from "../validation";
import {Vec2} from "../vector.embeddable";
import WS, {EM, UserData} from "../ws";
import Zone from "./zone";

export default class Move {
	@OnlyLogged()
	async move(user: User, em: EM, raw: UserData) {
		const data = ensure(raw, {x: Is.int, y: Is.int});
		assert(Math.abs(data.x) <= 1 && Math.abs(data.y) <= 1);

		const oldZone = await Zone.getByUser(em, user);
		const diff = Vec2(data.x, data.y);
		user.position = user.position.add(diff);
		const newZone = await Zone.getByUser(em, user);
		if (oldZone != newZone) {
			oldZone.leave(user);
			newZone.enter(user);
			newZone.emit(user);
		}

		WS.pub(newZone.getName(), "move", {id: user.id, position: user.position.toPlain()});
	}
}