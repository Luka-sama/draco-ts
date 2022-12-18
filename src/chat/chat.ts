import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator";
import ORM from "../core/orm";
import {ensure, Is} from "../core/validation";
import {LoggedArgs} from "../core/ws.typings";
import Message from "./message.entity";

export default class Chat {
	@OnlyLogged()
	static sendMessage({user, raw}: LoggedArgs): void {
		const {text} = ensure(raw, {text: Is.string});
		assert(text.length <= 255);
		const message = new Message(text, user);
		ORM.register(message);
	}
}