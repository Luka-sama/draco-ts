import assert from "assert/strict";
import _ from "lodash";
import {OnlyLogged} from "../auth/auth.decorator.js";
import {LoggedArgs} from "../core/ws.typings.js";
import Limit from "../util/limit.js";
import {ensure, Is} from "../util/validation.js";
import LightsGroup from "./lights-group.entity.js";

export default class MagicControl {
	@OnlyLogged()
	static async changeLightsGroupDirection({raw, user}: LoggedArgs): Promise<void> {
		const {lightId, direction} = ensure(raw, {lightId: Is.int, direction: Is.vec2i});
		assert(Math.abs(direction.x) <= 1 && Math.abs(direction.y) <= 1 && (direction.x != 0 || direction.y != 0));
		await Limit.softBySpeed("MagicControl.changeLightsGroupDirection", user, 100);

		const lightsGroup = await LightsGroup.getOrFail(lightId);
		const userLightsGroups = user.lightsGroups.getItems();
		userLightsGroups.forEach(lightsGroup => lightsGroup.activated = false);
		if (lightsGroup.targetMage != user) {
			const userLights = userLightsGroups.filter(lightsGroup => !lightsGroup.activated);
			assert(userLights.length > 0);
			userLights[_.random(0, userLights.length - 1)].targetMage = lightsGroup.targetMage;
			lightsGroup.targetMage = user;
		}
		/*lightsGroup.direction = lightsGroup.direction.add(direction).sign();
		if (lightsGroup.direction.equals(Vec2(0))) {
			lightsGroup.direction = lightsGroup.direction.add(direction).sign();
		}*/
		lightsGroup.direction = direction;
		lightsGroup.activated = true;
	}
}