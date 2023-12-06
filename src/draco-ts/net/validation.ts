import assert from "assert/strict";
import _ from "lodash";
import util from "util";
import Logger, {NotLoggableError} from "../logger.js";
import {Vec2f, Vec2i, Vec3f, Vec3i, Vector2f, Vector2i, Vector3f, Vector3i} from "../math/vector.js";

/** Return type of JSON.parse() without arrays and objects */
export type JSONPrimitives = string | number | boolean | null;
/** Type of an object that can return JSON.parse() */
export type JSONObject = {[key: string]: JSONData | undefined};
/** Return type of JSON.parse() */
export type JSONData = JSONPrimitives | JSONData[] | JSONObject;
/** The same as {@link JSONData} extended with vectors */
export type JSONDataExtended = JSONPrimitives | JSONDataExtended[] | JSONObjectExtended;
/** The same as {@link JSONObject} extended with vectors */
export type JSONObjectExtended = {[key: string]: JSONDataExtended | undefined} | Vector2f | Vector2i | Vector3f | Vector3i;

/** Function {@link ensure} throws this error if the data is wrong, i.e. does not correspond to the given template */
export class WrongDataError extends NotLoggableError {
	public static logger = new Logger("Validation");
	public name = "WrongDataError";

	public constructor(message: string) {
		super(message);
		WrongDataError.logger.error(util.format(this));
	}
}

/** Provides types for {@link ensure} */
export const Is = {
	string: "",
	float: 0.5,
	int: 0,
	bool: true,
	null: null,
	vec2f: Vector2f.Zero,
	vec2i: Vector2i.Zero,
	vec3f: Vector3f.Zero,
	vec3i: Vector3i.Zero,
	array: <T extends JSONDataExtended>(values: T): T[] => [values],
};

/** Provides types for {@link ensure} (for arrays) */
export const Of = {
	strings: Is.string,
	floats: Is.float,
	ints: Is.int,
	bools: Is.bool,
	nulls: Is.null,
	vec2fs: Is.vec2f,
	vec2is: Is.vec2i,
	vec3fs: Is.vec3f,
	vec3is: Is.vec3i,
	arrays: Is.array,
};

function getType(value: unknown): (
	"undefined" | "object" | "boolean" | "number" | "string" | "function" | "symbol" | "bigint" |
	"vector2f" | "vector2i" | "vector3f" | "vector3i" | "array" | "null" | "int" | "float" | "non-plain"
	) {
	if (value instanceof Vector2f) {
		return "vector2f";
	} else if (value instanceof Vector2i) {
		return "vector2i";
	} else if (value instanceof Vector3f) {
		return "vector3f";
	} else if (value instanceof Vector3i) {
		return "vector3i";
	} else if (value instanceof Array) {
		return "array";
	} else if (value === null) {
		return "null";
	} else if (Number.isInteger(value)) {
		return "int";
	} else if (typeof value == "number") {
		return "float";
	} else if (typeof value == "object" && !_.isPlainObject(value)) {
		return "non-plain";
	}
	return typeof value;
}

/**
 * Checks if the data correspond to the given template. The main purpose is to check if the user sent the correct data.
 * So you can both prevent the cheating and get strict type checking.
 *
 * Example of use:
 * ```const {direction, run, someArray} = ensure(raw, {direction: Is.vec2i, run: Is.bool, someArray: Is.array(Of.ints)});```
 *
 * @param raw Raw data that should be checked
 * @param shouldBe Template to which the data should correspond
 * @param allowUnknownKeys Are keys allowed that are not present in `shouldBe`?
 * @param clone Should the objects and the arrays be cloned? If `false`, the original data can be modified to use vectors
 */
export function ensure<T extends JSONDataExtended>(
	raw: JSONDataExtended, shouldBe: T, allowUnknownKeys = false, clone = true
): T {
	// Primitives
	const rawType = getType(raw);
	const shouldBeType = getType(shouldBe);
	const canBeConvertedIn = (
		rawType == shouldBeType || (rawType == "int" && shouldBeType == "float") ||
		(rawType == "object" && ["vector2f", "vector2i", "vector3f", "vector3i"].includes(shouldBeType))
	);
	if (!canBeConvertedIn) {
		throw new WrongDataError(`Wrong type (${rawType} instead of ${shouldBeType}).`);
	} else if (!_.isObject(shouldBe)) {
		return raw as T;
	} else if (shouldBeType == "non-plain") {
		throw new WrongDataError("Wrong template (non-plain object).");
	}

	// Vectors
	if (shouldBe instanceof Vector2f) {
		return (raw instanceof Vector2f ? raw : Vec2f(ensure(raw, {x: Is.float, y: Is.float}))) as T;
	} else if (shouldBe instanceof Vector2i) {
		return (raw instanceof Vector2i ? raw : Vec2i(ensure(raw, {x: Is.int, y: Is.int}))) as T;
	} else if (shouldBe instanceof Vector3f) {
		return (raw instanceof Vector3f ? raw : Vec3f(ensure(raw, {x: Is.float, y: Is.float, z: Is.float}))) as T;
	} else if (shouldBe instanceof Vector3i) {
		return (raw instanceof Vector3i ? raw : Vec3i(ensure(raw, {x: Is.int, y: Is.int, z: Is.int}))) as T;
	}

	// Arrays
	if (shouldBe instanceof Array) {
		assert(raw instanceof Array);
		if (!clone) {
			raw.forEach((el, index) => {
				raw[index] = ensure(el, shouldBe[0], allowUnknownKeys, clone);
			});
			return raw as T;
		}
		return raw.map(el => ensure(el, shouldBe[0], allowUnknownKeys, clone)) as T;
	}

	// Objects
	if (!allowUnknownKeys) {
		const unknownKeys = Object.keys(raw || {}).filter(key => !(key in shouldBe));
		if (unknownKeys.length > 0) {
			throw new WrongDataError(`Unknown key${unknownKeys.length > 1 ? "s" : ""} ${unknownKeys.join(", ")}.`);
		}
	}

	assert(
		raw && typeof raw == "object" && !(raw instanceof Array) &&
		!(raw instanceof Vector2f) && !(raw instanceof Vector2i) &&
		!(raw instanceof Vector3f) && !(raw instanceof Vector3i)
	);
	const result: Exclude<JSONObjectExtended, Vector2f | Vector2i | Vector3f | Vector3i> = (clone ? {} : raw);
	for (const key in shouldBe) {
		const rawValue = raw[key];
		const shouldBeValue = shouldBe[key];
		if (rawValue === undefined) {
			throw new WrongDataError(`Key ${key} not found.`);
		} else if (shouldBeValue == undefined) {
			throw new WrongDataError(`Wrong template (key ${key} is undefined).`);
		}
		result[key] = ensure(rawValue, shouldBeValue, allowUnknownKeys, clone);
	}
	return result as T;
}