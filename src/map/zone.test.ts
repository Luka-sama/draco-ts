import {mock, mockReset} from "jest-mock-extended";
import {Vec2} from "../vector";
import {EM} from "../ws";
import Location from "./location.entity";
import Zone from "./zone";

const em = mock<EM>();
beforeEach(() => {
	mockReset(em);
});

test.each([
	[Zone.SIZE.add(Vec2(-1, 0)), false],
	[Zone.SIZE, true],
	[Zone.SIZE.add(Vec2(1, 0)), true],
	[Zone.SIZE.mul(2).add(Vec2(-1, -1)), true],
	[Zone.SIZE.mul(2).add(Vec2(-1, 0)), false],
])("isInside", async (v, expected) => {
	const location = new Location("test");
	const zone = await Zone.get(em, location, Vec2(1, 1));
	zone["loaded"] = true;

	expect(zone.isInside(v)).toBe(expected);
});