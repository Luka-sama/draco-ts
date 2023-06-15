import assert from "assert/strict";
import {OnlyLogged} from "../auth/auth.decorator.js";
import {LoggedArgs} from "../core/ws.typings.js";
import Zone from "../map/zone.js";
import Const from "../util/const.js";
import Limit from "../util/limit.js";
import SetUtil from "../util/set-util.js";
import {ensure, Is} from "../util/validation.js";
import {Vec2, Vector2} from "../util/vector.js";
import Item from "./item.entity.js";

export default class Inventory {
	@OnlyLogged()
	static async takeItem({user, zone}: LoggedArgs): Promise<void> {
		await Limit.soft("Inventory.takeItem", user, 100);

		const itemsNearby = new Set<Item>;
		for (const y of Const.NEIGHBORING_Y) {
			for (const x of Const.NEIGHBORING_X) {
				const positionToCheck = user.position.add(Vec2(x, y));
				SetUtil.merge(itemsNearby, zone.getFrom(Item, positionToCheck));
			}
		}

		let itemToTake: Item | undefined;
		for (const item of itemsNearby) {
			if (item.type.takable) {
				itemToTake = item;
				break;
			}
		}

		if (itemToTake) {
			user.items.add(itemToTake);
			itemToTake.position = user.position;
			Limit.updateLastTime("Inventory.takeItem", user);
		}
	}

	@OnlyLogged()
	static async putItem({raw, user}: LoggedArgs): Promise<void> {
		const {itemId} = ensure(raw, {itemId: Is.int});
		await Limit.soft("Inventory.putItem", user, 100);

		const item = await Item.getOrFail(itemId);
		assert(item.holder == user);

		let canPut = true;
		if (!item.type.walkable) {
			const freeTile = await Inventory.findFreeTile(item);
			if (freeTile) {
				item.position = freeTile;
			} else {
				canPut = false;
			}
		}

		if (canPut) {
			user.items.remove(item);
			Limit.updateLastTime("Inventory.putItem", user);
		}
	}

	private static async findFreeTile(item: Item): Promise<Vector2 | null> {
		for (const y of Const.NEIGHBORING_Y) {
			for (const x of Const.NEIGHBORING_X) {
				const positionToCheck = item.position.add(Vec2(x, y));
				const positions = item.getPositions(positionToCheck, true);
				const areTilesFree = await Zone.areTilesFree(item.location, positions);
				if (areTilesFree) {
					return positionToCheck;
				}
			}
		}
		return null;
	}
}