import assert from "assert/strict";
import {test} from "node:test";
import MapUtil from "./map-util.js";

const object = {"nestedKey": 123};

test("get", () => {
	const map = new Map<string, number>;
	assert.equal(MapUtil.get(map, "key", 123), 123);
	assert.equal(MapUtil.get(map, "key", 100), 123);
});

test("getArray", () => {
	const map = new Map<string, number[]>;
	const array = MapUtil.getArray(map, "key");
	assert.deepEqual(array, []);
	(array as number[]).push(123);
	assert.deepEqual(MapUtil.getArray(map, "key"), [123]);
});

test("getMap", () => {
	const map = new Map<string, Map<string, number>>;
	const nestedMap = MapUtil.getMap(map, "key");
	assert.deepEqual(nestedMap, new Map);
	nestedMap.set("nestedKey", 123);
	assert.deepEqual(MapUtil.getMap(map, "key"), new Map([["nestedKey", 123]]));
});

test("getSet", () => {
	const map = new Map<string, Set<number>>;
	const set = MapUtil.getSet(map, "key");
	assert.deepEqual(set, new Set);
	set.add(123);
	assert.deepEqual(MapUtil.getSet(map, "key"), new Set([123]));
});

test("getWeakMap", () => {
	const map = new Map<string, WeakMap<object, number>>;
	const weakMap = MapUtil.getWeakMap(map, "key");
	assert.deepEqual(weakMap, new WeakMap);
	weakMap.set(object, 123);
	assert.equal(MapUtil.getWeakMap(map, "key").get(object), 123);
});

test("getWeakSet", () => {
	const map = new Map<string, WeakSet<object>>;
	const set = MapUtil.getWeakSet(map, "key");
	assert.deepEqual(set, new WeakSet);
	assert.equal(set.has(object), false);
	set.add(object);
	assert(MapUtil.getWeakSet(map, "key").has(object));
});