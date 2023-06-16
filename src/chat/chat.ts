import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator.js";
import {LoggedArgs} from "../core/ws.typings.js";
import {ensure, Is} from "../util/validation.js";
import Message from "./message.entity.js";

export default class Chat {
	@OnlyLogged()
	static sendMessage({user, raw}: LoggedArgs): void {
		const {text} = ensure(raw, {text: Is.string});
		assert(text.length <= 255);
		Message.create({text, user, location: user.location, position: user.position});
	}
}