/** A floating-point number between approximately ±1.5e-45 and ±3.4e38 */
export type Float = number;
/** A floating-point number between approximately ±5.0e-324 and ±1.7e308 (IEEE 754 double-precision) */
export type Double = number;
/** An integer between -2.147.483.648 and 2.147.483.647 */
export type Int32 = number;
/** An integer between -9.223.372.036.854.775.808 and 9.223.372.036.854.775.807 */
export type Int64 = bigint;
/** An integer between 0 and 4.294.967.295 */
export type UInt32 = number;
/** An integer between 0 and 18.446.744.073.709.551.615 */
export type UInt64 = bigint;

/** Any class (not class instance) */
export type Class = abstract new (...args: any[]) => unknown;

/**
 * Ensures that no extra keys are used.
 * Example of use: `type WithSomeParameters<T, O extends Exact<{a: number}, O>> = T;`
 * Then you can write `let T: WithSomeParameters<string, {a: 123}>`,
 * but can't write `let T: WithSomeParameters<string, {a: 123, b: 124}>`.
 */
export type Exact<T, U extends T> = T & {[K in Exclude<keyof U, keyof T>]: never};

/** This class is necessary to make class search work, see {@link TypeAnalyzer} for details */
export class CoreTypings {}