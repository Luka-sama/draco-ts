import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator";
import {EM} from "../core/orm";
import {ensure, Is} from "../core/validation";
import {LoggedArgs} from "../core/ws.typings";
import Zone from "../map/zone";
import Message from "./message.entity";

export default class Chat {
	static DELETE_AFTER_MS = 300 * 1000;
	static HEARING_RADIUS = 30;

	@OnlyLogged()
	static sendMessage({user, raw}: LoggedArgs): void {
		const {text} = ensure(raw, {text: Is.string});
		assert(text.length <= 255);
		const message = new Message(text, user);
		EM.persist(message);
		setTimeout(async () => {
			const zone = await Zone.getByEntity(message);
			zone.leave(message);
		}, Chat.DELETE_AFTER_MS);
	}
}