import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator.js";
import ORM from "../core/orm.js";
import {ensure, Is} from "../core/validation.js";
import {LoggedArgs} from "../core/ws.typings.js";
import Message from "./message.entity.js";

export default class Chat {
	@OnlyLogged()
	static sendMessage({user, raw}: LoggedArgs): void {
		const {text} = ensure(raw, {text: Is.string});
		assert(text.length <= 255);
		const message = new Message(text, user);
		ORM.register(message);
	}
}