import assert from "assert/strict";
import _ from "lodash";
import {LoggedArgs, OnlyLogged} from "../auth/auth.decorator.js";
import User from "../auth/user.entity.js";
import ORM from "../draco-ts/orm/orm.js";
import {ensure, Is} from "../draco-ts/util/validation.js";
import {Vec2} from "../draco-ts/util/vector.js";
import Message from "./message.entity.js";

export default class Chat {
	/** Delete message from chat after .. ms */
	public static readonly DELETE_MESSAGE_AFTER = 300 * 1000;
	/** Hearing radius (in tiles) */
	public static readonly HEARING_RADIUS = 1000;
	private static fightLeft = 0;

	@OnlyLogged()
	static sendMessage({user, raw}: LoggedArgs): void {
		const {text} = ensure(raw, {text: Is.string});
		assert(text.length <= 255);
		Message.create({text, user, location: user.location, position: user.position});
		if (text.toLowerCase().includes("fight")) {
			if (Chat.fightLeft <= 0 || text.toLowerCase().includes("restart")) {
				Chat.fightLeft = _.clamp(+text.replace(/\D/g, "") || 4, 1, 10) * 60000;
				Chat.resetHits();
			} else {
				Message.create({text: "The fight is already going on.", user: {id: 7}, location: {id: 1}, position: Vec2(0)});
			}
		}
	}

	static sendTime(delta: number) {
		if (Chat.fightLeft <= 0) {
			return;
		}
		const newLeft = Chat.fightLeft - delta;
		const intervals = [];
		for (let i = 10; i > 0; i--) {
			intervals.push(i * 60);
		}
		intervals.push(30);
		intervals.push(15);
		let left = "", text = "";
		for (const interval of intervals) {
			if (Chat.fightLeft >= interval * 1000 && newLeft < interval * 1000) {
				if (interval < 60) {
					left = `${interval} seconds`;
				} else {
					left = `${Math.round(interval / 60)} minutes`;
				}
			}
		}

		if (left) {
			text = `Tick tock, ${left} left!`;
		} else if (newLeft <= 0) {
			const users = Array.from(ORM.cachedEntries.get(User)!.values()).filter(user => user.connected);
			let winner;
			for (const user of users) {
				if (!winner || user.pigeonHits < winner.pigeonHits) {
					winner = user;
				}
			}
			if (winner) {
				text = `${winner.name} is the cleanest one!`;
			} else {
				text = `Nobody is clean :(`;
			}
			Chat.resetHits();
		}
		if (text) {
			Message.create({text, user: {id: 7}, location: {id: 1}, position: Vec2(0)});
		}

		Chat.fightLeft = newLeft;
	}

	static resetHits() {
		const users = Array.from(ORM.cachedEntries.get(User)!.values());
		for (const user of users) {
			user.pigeonHits = 0;
		}
	}
}