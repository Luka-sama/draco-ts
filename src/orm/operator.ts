import {DBValue} from "./db.typings.js";

/**
 * Some operator with one or two operands that can be used in the conditions when building queries.
 * For example, this query selects all users with id less than 10:
 * ```ts
 * await db.select("user", {id: lt(10)});
 * ```
 * This is a shortcut for:
 * ```ts
 * await db.select("user", {id: new Operator("<", 10)});
 * ```
 */
export default class Operator {
	/** Creates an instance of some operator with one or two operands */
	constructor(public operator: string, public operand: DBValue, public operand2?: DBValue) {
	}
}

/** Less than `operand`. See {@link Operator} */
export function lt(operand: DBValue): Operator {
	return new Operator("<", operand);
}

/** Less than or equal to `operand`. See {@link Operator} */
export function lte(operand: DBValue): Operator {
	return new Operator("<=", operand);
}

/** Greater than `operand`. See {@link Operator} */
export function gt(operand: DBValue): Operator {
	return new Operator(">", operand);
}

/** Greater than or equal to `operand`. See {@link Operator} */
export function gte(operand: DBValue): Operator {
	return new Operator(">=", operand);
}

/** Between `operand1` and `operand2`. See {@link Operator} */
export function between(operand1: DBValue, operand2: DBValue) {
	return new Operator("BETWEEN", operand1, operand2);
}

/**
 * Used as a key, it connects two conditions with `AND`, for example:
 * ```ts
 * await db.select("user", {[and]: [{id: 1}, {name: "Test"}]});
 * ```
 * Note that you don't need this keyword normally, as you can just write like this:
 * ```ts
 * await db.select("user", {id: 1, name: "Test"});
 * ```
 * An example where this keyword has a sense:
 * ```ts
 * await db.select("user", {[and]: [{id: gt(2)}, {id: lte(5)}]});
 * ```
 */
const and = Symbol("and");
/**
 * Used as a key, it connects two conditions with `OR`, for example:
 * ```ts
 * await db.select("user", {[or]: [{id: 1}, {name: "Test"}]});
 * ```
 * Note that you don't need this keyword in simple cases, as you can just write like this:
 * ```ts
 * await db.select("user", [{id: 1}, {name: "Test"}]);
 * ```
 */
const or = Symbol("or");
export {and, or};