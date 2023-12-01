import assert from "assert/strict";
import {test} from "node:test";
import WS from "./ws.js";

test("bufferToStr", () => {
	const testString = "test string";
	const buffer = Buffer.from(testString);
	assert.equal(WS["bufferToStr"](buffer), testString);
});