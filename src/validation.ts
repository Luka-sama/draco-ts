import {ClassType, transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {Vec2, Vector2} from "./vector.embeddable";
import {UserData, UserDataExtended} from "./ws";

/**
 * Converts raw user data to object
 *
 * If user sent wrong data, returns array with violated constraints.
 * Use [[hasErrors]] to check if the conversion has failed.
 * See also [class-transformer-validator](https://github.com/MichalLytek/class-transformer-validator) for details.
 *
 * @category Validation
 */
export async function toObject<T extends object>(classType: ClassType<T>, object: object, options?: TransformValidationOptions): Promise<T | string[]> {
	try {
		return await transformAndValidate(classType, object, options);
	} catch(errors) {
		const constraints = [];
		for (const error of errors as ValidationError[]) {
			if (error.constraints) {
				constraints.push(...Object.values(error.constraints));
			}
		}
		return constraints;
	}
}

/**
 * Checks if the conversion from [[toObject]] has failed
 * @param obj Converted object (from user data)
 *
 * @category Validation
 */
export function hasErrors(obj: unknown): obj is string[] {
	return obj instanceof Array;
}

/**
 * Function [[ensure]] throws this error if user sent wrong data
 *
 * @category Validation
 */
export class WrongDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WrongDataError";
	}
}

/**
 * Provides types for [[ensure]]
 *
 * @category Validation
 */
export class Is {
	static string = "";
	static double = 0.5;
	static int = 0;
	static bool = true;
	static null = null;
	static vec2f = Vec2(0.5, 0.5);
	static vec2i = Vec2();
	static array<T>(values: T): Array<T> {
		return [values] as Array<T>;
	}
}

/**
 * Provides types for [[ensure]] (for arrays)
 *
 * @category Validation
 */
export class Of {
	static strings = "";
	static doubles = 0.5;
	static ints = 0;
	static bools = true;
	static nulls = null;
	static vec2fs = Is.vec2f;
	static vec2is = Is.vec2i;
	static arrays<T>(values: T): Array<T> {
		return [values] as Array<T>;
	}
}

/**
 * Checks if user sent correct data
 *
 * @param raw Raw user data
 * @param shouldBe Template to which the data should correspond
 * @param allowUnknownKeys Are unknown keys allowed?
 *
 * @category Validation
 */
export function ensure<T extends UserDataExtended>(raw: UserData, shouldBe: T, allowUnknownKeys = false): T {
	if (!allowUnknownKeys) {
		for (const key in raw) {
			if (!(key in shouldBe)) {
				throw new WrongDataError(`unknown key ${key}`);
			}
		}
	}

	const result = raw as UserDataExtended;
	if (shouldBe instanceof Vector2) {
		if (typeof raw == "object" && raw && !(raw instanceof Array)) {
			return Vec2(ensure(raw, {x: shouldBe.x, y: shouldBe.y}, allowUnknownKeys)) as T;
		} else {
			throw new WrongDataError(`Wrong type of data (type ${typeof raw}, should be Vector2)`);
		}
	}
	for (const key in shouldBe) {
		const val = raw[key];
		const toBe = shouldBe[key];
		const dataType = typeof val;
		const shouldBeType = typeof toBe;
		const dataIsArray = val instanceof Array;
		const shouldBeArray = toBe instanceof Array;
		const isInt = ( dataType == "number" && Number.isInteger(val) );
		const shouldBeInt = ( shouldBeType == "number" && Number.isInteger(toBe) );
		if (dataType != shouldBeType || dataIsArray != shouldBeArray) {
			throw new WrongDataError(`Wrong type of ${key} (type ${dataType}, should be ${shouldBeType})`);
		} else if (shouldBeInt && !isInt) {
			throw new WrongDataError(`Wrong type of ${key} (type double, should be int)`);
		}
		if (dataIsArray && shouldBeArray && toBe.length > 0) {
			for (let i = 0; i < val.length; i++) {
				val[i] = ensure({test: val[i]}, {test: toBe[0]}, allowUnknownKeys).test;
			}
		} else if (typeof val == "object" && val && !dataIsArray
				&& typeof toBe == "object" && toBe && !shouldBeArray && !(result instanceof Vector2)) {
			if (toBe instanceof Vector2) {
				result[key] = ensure(val, toBe, allowUnknownKeys);
			} else if (toBe) {
				ensure(val, toBe as any, allowUnknownKeys);
			}
		}
	}
	return result as T;
}

/**
 * Ensures that condition is true
 *
 * @param condition Condition
 *
 * @category Validation
 */
export function assert(condition: boolean) {
	if (!condition) {
		throw new WrongDataError("Wrong assert");
	}
}