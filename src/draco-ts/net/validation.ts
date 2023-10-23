import assert from "assert/strict";
import _ from "lodash";
import util from "util";
import Logger, {NotLoggableError} from "./logger.js";
import {Vec2, Vec3, Vector2, Vector3} from "./vector.js";

/** Return type of JSON.parse() without arrays and objects */
export type JSONPrimitives = string | number | boolean | null;
/** Type of an object that can return JSON.parse() */
export type JSONObject = {[key: string]: JSONData | undefined};
/** Return type of JSON.parse() */
export type JSONData = JSONPrimitives | JSONData[] | JSONObject;
/** The same as {@link JSONData} extended with vectors */
export type JSONDataExtended = JSONPrimitives | JSONDataExtended[] | JSONObjectExtended;
/** The same as {@link JSONObject} extended with vectors */
export type JSONObjectExtended = {[key: string]: JSONDataExtended | undefined} | Vector2 | Vector3;

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
	vec2f: Vec2(0.5),
	vec2i: Vec2(),
	vec3f: Vec3(0.5),
	vec3i: Vec3(),
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
	"vector2" | "vector3" | "array" | "null" | "int" | "float" | "non-plain"
	) {
	if (value instanceof Vector2) {
		return "vector2";
	} else if (value instanceof Vector3) {
		return "vector3";
	} else if (value instanceof Array) {
		return "array";
	} else if (value === null) {
		return "null";
	} else if (typeof value == "number" && Number.isInteger(value)) {
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
 * Example of using:
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
		(rawType == "object" && shouldBeType == "vector2") || (rawType == "object" && shouldBeType == "vector3")
	);
	if (!canBeConvertedIn) {
		throw new WrongDataError(`Wrong type (${rawType} instead of ${shouldBeType}).`);
	} else if (!_.isObject(shouldBe)) {
		return raw as T;
	} else if (shouldBeType == "non-plain") {
		throw new WrongDataError("Wrong template (non-plain object).");
	}

	// Vectors
	if (shouldBe instanceof Vector2) {
		return (raw instanceof Vector2 ? raw : Vec2(ensure(raw, {x: shouldBe.x, y: shouldBe.y}))) as T;
	} else if (shouldBe instanceof Vector3) {
		return (raw instanceof Vector3 ? raw : Vec3(ensure(raw, {x: shouldBe.x, y: shouldBe.y, z: shouldBe.z}))) as T;
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

	assert(raw && typeof raw == "object" && !(raw instanceof Array) && !(raw instanceof Vector2) && !(raw instanceof Vector3));
	const result: Exclude<JSONObjectExtended, Vector2 | Vector3> = (clone ? {} : raw);
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