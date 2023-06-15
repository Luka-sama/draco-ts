import Const from "../util/const.js";
import {Vec2} from "../util/vector.js";
import Location from "./location.entity.js";
import Subzone from "./subzone.js";

test.each([
	[Const.SUBZONE_SIZE.add(Vec2(-1, 0)), false],
	[Const.SUBZONE_SIZE, true],
	[Const.SUBZONE_SIZE.add(Vec2(1, 0)), true],
	[Const.SUBZONE_SIZE.mul(2).add(Vec2(-1, -1)), true],
	[Const.SUBZONE_SIZE.mul(2).add(Vec2(-1, 0)), false],
])("isInside", async (v, expected) => {
	const location = await Location.getOrFail(1);
	const zone = await Subzone.get(location, Vec2(1, 1));

	expect(zone.isInside(v)).toBe(expected);
});