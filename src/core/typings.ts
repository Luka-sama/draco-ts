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

/** Any primitive value that can be serialized with JSON */
export type SerializablePrimitive = boolean | null | number | string;
/** Any primitive value */
export type Primitive = SerializablePrimitive | bigint | symbol | undefined;
/** Any class (not class instance) */
export type Class = abstract new (...args: any[]) => unknown;
/** Constructor of class T */
export type Constructor<T> = new (...args: any[]) => T;
/**
 * This type constructs a plain object whose properties are the same as in T (without methods).
 * Example of how to use: `PropertiesOf<InstanceType<MyClass>>` or `PropertiesOf<this>`.
 */
export type PropertiesOf<T> = Pick<T, {
	[K in keyof T]: T[K] extends (...args: any[]) => unknown ? never : K
}[keyof T]>;

/**
 * Ensures that no extra keys are used.
 * Example of use: `type WithSomeParameters<T, O extends Exact<{a: number}, O>> = T;`
 * Then you can write `let T: WithSomeParameters<string, {a: 123}>`,
 * but can't write `let T: WithSomeParameters<string, {a: 123, b: 124}>`.
 */
export type Exact<T, U extends T> = T & {[K in Exclude<keyof U, keyof T>]: never};

/**
 * This class is necessary to make class search work, see {@link TypeAnalyzer} for details.
 * It also provides constants with integer ranges.
 */
export class Typings {
	public static readonly INT32_MIN_VALUE = -2_147_483_648;
	public static readonly INT32_MAX_VALUE = 2_147_483_647;
	public static readonly UINT32_MIN_VALUE = 0;
	public static readonly UINT32_MAX_VALUE = 4_294_967_295;
	public static readonly INT64_MIN_VALUE = -9_223_372_036_854_775_808n;
	public static readonly INT64_MAX_VALUE = 9_223_372_036_854_775_807n;
	public static readonly UINT64_MIN_VALUE = 0n;
	public static readonly UINT64_MAX_VALUE = 18_446_744_073_709_551_615n;
}