import SetUtil from "./set-util.js";

const A = new Set([1, 2, 3, 4]);
const B = new Set([2, 4, 6, 8]);

test("merge", () => {
	const C = new Set([2, 10]);
	SetUtil.merge(C, A);
	expect(C).toStrictEqual(new Set([2, 10, 1, 3, 4]));
});

test("isSuperset", () => {
	const C = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
	expect(SetUtil.isSuperset(A, B)).toBeFalsy();
	expect(SetUtil.isSuperset(C, A)).toBeTruthy();
});

test("isSubset", () => {
	const C = new Set([1, 4]);
	expect(SetUtil.isSubset(A, B)).toBeFalsy();
	expect(SetUtil.isSubset(C, A)).toBeTruthy();
});

test("haveCommonElements", () => {
	const C = new Set([10, 20]);
	expect(SetUtil.haveCommonElements(A, B)).toBeTruthy();
	expect(SetUtil.haveCommonElements(A, C)).toBeFalsy();
});

test("areEqual", () => {
	const C = new Set([1, 2, 3, 4]);
	expect(SetUtil.areEqual(A, B)).toBeFalsy();
	expect(SetUtil.areEqual(A, C)).toBeTruthy();
});

test("union", () => {
	expect(SetUtil.union(A, B)).toStrictEqual(new Set([1, 2, 3, 4, 6, 8]));
});

test("intersection", () => {
	expect(SetUtil.intersection(A, B)).toStrictEqual(new Set([2, 4]));
});

test("difference", () => {
	expect(SetUtil.difference(A, B)).toStrictEqual(new Set([1, 3]));
});

test("symmetricDifference", () => {
	expect(SetUtil.symmetricDifference(A, B)).toStrictEqual(new Set([1, 3, 6, 8]));
});