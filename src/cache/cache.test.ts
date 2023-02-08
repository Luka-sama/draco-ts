import Const from "../util/const.js";
import Cache from "./cache.js";

test("clean", () => {
	const name = "test/some/entry";
	const value = "some value";
	Cache.set(name, value);
	expect(Cache.get(name)).toBe(value);
	Cache["clean"]();
	expect(Cache.get(name)).toBe(value);
	Cache["searchFor"](name).entry!.lastAccess = Date.now() - Const.CACHE_DEFAULT_DURATION_MS - 5;
	Cache["clean"]();
	expect(Cache.has(name)).toBeFalsy();
	expect(Cache["entries"].has("test")).toBeFalsy();
});