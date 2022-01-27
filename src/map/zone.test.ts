import {Vec2} from "../vector.embeddable";
import Location from "./location.entity";
import Zone from "./zone";

test.each([
	[Zone.SIZE.add(Vec2(-1, 0)), false],
	[Zone.SIZE, true],
	[Zone.SIZE.add(Vec2(1, 0)), true],
	[Zone.SIZE.mul(2).add(Vec2(-1, -1)), true],
	[Zone.SIZE.mul(2).add(Vec2(-1, 0)), false],
])("isInside", async (v, expected) => {
	const location = new Location("test");
	const zone = await Zone.get(location, Vec2(1, 1));

	expect(zone.isInside(v)).toBe(expected);
});