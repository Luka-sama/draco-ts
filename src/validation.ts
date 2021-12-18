import {ClassType, transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {UserData} from "./ws";

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
	static number = 0;
	static bool = true;
	static null = null;
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
	static numbers = 0;
	static bools = true;
	static nulls = null;
	static arrays<T>(values: T): Array<T> {
		return [values] as Array<T>;
	}
}

/**
 * Checks if user sent correct data
 *
 * @param data Raw user data
 * @param shouldBe Template to which the data should correspond
 * @param allowUnknownKeys Are unknown keys allowed?
 *
 * @category Validation
 */
export function ensure<T extends UserData>(data: UserData, shouldBe: T, allowUnknownKeys = false): T {
	if (!allowUnknownKeys) {
		for (const key in data) {
			if (!(key in shouldBe)) {
				throw new WrongDataError(`unknown key ${key}`);
			}
		}
	}

	for (const key in shouldBe) {
		const val = data[key];
		const toBe = shouldBe[key];
		const dataType = typeof val;
		const shouldBeType = typeof toBe;
		const dataIsArray = val instanceof Array;
		const shouldBeArray = toBe instanceof Array;
		if (dataType != shouldBeType || dataIsArray != shouldBeArray) {
			throw new WrongDataError(`wrong type ${key} (type ${dataType}, should be ${shouldBeType})`);
		}
		if (dataIsArray && shouldBeArray && toBe.length > 0) {
			for (const item of val) {
				ensure({test: item}, {test: toBe[0]}, allowUnknownKeys);
			}
		} else if (typeof val == "object" && typeof toBe == "object" && val && toBe && !dataIsArray && !shouldBeArray) {
			ensure(val, toBe, allowUnknownKeys);
		}
	}
	return data as T;
}