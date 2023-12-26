import assert from "assert/strict";
import {test} from "node:test";
import SetUtil from "./set-util.js";

const A = new Set([1, 2, 3, 4]);
const B = new Set([2, 4, 6, 8]);

test("merge", () => {
	const C = new Set([2, 10]);
	SetUtil.merge(C, A);
	assert.deepEqual(C, new Set([2, 10, 1, 3, 4]));
});

test("isSuperset", () => {
	const C = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
	assert.equal(SetUtil.isSuperset(A, B), false);
	assert.equal(SetUtil.isSuperset(C, A), true);
});

test("isSubset", () => {
	const C = new Set([1, 4]);
	assert.equal(SetUtil.isSubset(A, B), false);
	assert.equal(SetUtil.isSubset(C, A), true);
});

test("haveCommonElements", () => {
	const C = new Set([10, 20]);
	assert.equal(SetUtil.haveCommonElements(A, B), true);
	assert.equal(SetUtil.haveCommonElements(A, C), false);
});

test("areEqual", () => {
	const C = new Set([1, 2, 3, 4]);
	assert.equal(SetUtil.areEqual(A, B), false);
	assert.equal(SetUtil.areEqual(A, C), true);
});

test("union", () => {
	assert.deepEqual(SetUtil.union(A, B), new Set([1, 2, 3, 4, 6, 8]));
});

test("intersection", () => {
	assert.deepEqual(SetUtil.intersection(A, B), new Set([2, 4]));
});

test("difference", () => {
	assert.deepEqual(SetUtil.difference(A, B), new Set([1, 3]));
});

test("symmetricDifference", () => {
	assert.deepEqual(SetUtil.symmetricDifference(A, B), new Set([1, 3, 6, 8]));
});