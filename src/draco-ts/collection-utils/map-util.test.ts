import MapUtil from "./map-util.js";

const object = {"nestedKey": 123};

test("get", () => {
	const map = new Map<string, number>;
	expect(MapUtil.get(map, "key", 123)).toBe(123);
	expect(MapUtil.get(map, "key", 100)).toBe(123);
});

test("getArray", () => {
	const map = new Map<string, number[]>;
	const array = MapUtil.getArray(map, "key");
	expect(array).toEqual([]);
	array.push(123);
	expect(MapUtil.getArray(map, "key")).toEqual([123]);
});

test("getMap", () => {
	const map = new Map<string, Map<string, number>>;
	const nestedMap = MapUtil.getMap(map, "key");
	expect(nestedMap).toEqual(new Map);
	nestedMap.set("nestedKey", 123);
	expect(MapUtil.getMap(map, "key")).toEqual(new Map([["nestedKey", 123]]));
});

test("getSet", () => {
	const map = new Map<string, Set<number>>;
	const set = MapUtil.getSet(map, "key");
	expect(set).toEqual(new Set);
	set.add(123);
	expect(MapUtil.getSet(map, "key")).toEqual(new Set([123]));
});

test("getWeakMap", () => {
	const map = new Map<string, WeakMap<object, number>>;
	const weakMap = MapUtil.getWeakMap(map, "key");
	expect(weakMap).toEqual(new WeakMap);
	weakMap.set(object, 123);
	expect(MapUtil.getWeakMap(map, "key").get(object)).toBe(123);
});

test("getWeakSet", () => {
	const map = new Map<string, WeakSet<object>>;
	const set = MapUtil.getWeakSet(map, "key");
	expect(set).toEqual(new WeakSet);
	expect(set.has(object)).toBeFalsy();
	set.add(object);
	expect(MapUtil.getWeakSet(map, "key").has(object)).toBeTruthy();
});