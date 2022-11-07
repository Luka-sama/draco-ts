import {ClassType, transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {Vec2, Vector2} from "../math/vector.embeddable";
import {UserData, UserDataExtended} from "./ws.typings";

/**
 * Converts raw user data to object
 *
 * If user sent wrong data, returns array with violated constraints.
 * Use {@link hasErrors} to check if the conversion has failed.
 * See also [class-transformer-validator](https://github.com/MichalLytek/class-transformer-validator) for details.
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
 * Checks if the conversion from {@link toObject} has failed
 * @param obj Converted object (from user data)
 */
export function hasErrors(obj: unknown): obj is string[] {
	return obj instanceof Array;
}

/** Function {@link ensure} throws this error if user sent wrong data */
export class WrongDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WrongDataError";
	}
}

/** Provides types for {@link ensure} */
export const Is = {
	string: "",
	double: 0.5,
	int: 0,
	bool: true,
	null: null,
	vec2f: Vec2(0.5, 0.5),
	vec2i: Vec2(),
	array<T>(values: T): T[] {
		return [values] as T[];
	}
};

/** Provides types for {@link ensure} (for arrays) */
export const Of = {
	strings: Is.string,
	doubles: Is.double,
	ints: Is.int,
	bools: Is.bool,
	nulls: Is.null,
	vec2fs: Is.vec2f,
	vec2is: Is.vec2i,
	arrays: Is.array
};

/**
 * Checks if user sent correct data
 *
 * @param raw Raw user data
 * @param shouldBe Template to which the data should correspond
 * @param allowUnknownKeys Are unknown keys allowed?
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