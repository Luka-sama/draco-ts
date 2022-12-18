import {Vec2} from "../math/vector.embeddable.js";
import Location from "./location.entity.js";
import Subzone from "./subzone.js";

test.each([
	[Subzone.SIZE.add(Vec2(-1, 0)), false],
	[Subzone.SIZE, true],
	[Subzone.SIZE.add(Vec2(1, 0)), true],
	[Subzone.SIZE.mul(2).add(Vec2(-1, -1)), true],
	[Subzone.SIZE.mul(2).add(Vec2(-1, 0)), false],
])("isInside", async (v, expected) => {
	const location = await Location.getOrFail(1);
	const zone = await Subzone.get(location, Vec2(1, 1));

	expect(zone.isInside(v)).toBe(expected);
});