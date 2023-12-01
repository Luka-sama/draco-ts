import assert from "assert/strict";
import {test} from "node:test";
import Cache from "./cache.js";

test("clean", () => {
	const name = "test/some/entry";
	const value = "some value";
	Cache.set(name, value);
	assert.equal(Cache.get(name), value);
	Cache["clean"]();
	assert.equal(Cache.get(name), value);
	Cache["searchFor"](name).entry!.lastAccess = Date.now() - Cache["DEFAULT_DURATION"] - 5;
	Cache["clean"]();
	assert.equal(Cache.has(name), false);
	assert.equal(Cache["entries"].has("test"), false);
});