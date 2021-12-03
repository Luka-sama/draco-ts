import {ClassType, transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {UserData} from "./ws";

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

export function hasErrors(obj: Object | string[]): obj is string[] {
	return obj instanceof Array;
}

export class WrongDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WrongDataError";
	}
}

export class Is {
	static string = "";
	static number = 0;
	static bool = true;
	static null = null;
	static array<T>(values: T): Array<T> {
		return [values] as Array<T>;
	}
}

export class Of {
	static strings = "";
	static numbers = 0;
	static bools = true;
	static nulls = null;
	static arrays<T>(values: T): Array<T> {
		return [values] as Array<T>;
	}
}

export function ensure<T extends UserData>(data: UserData, shouldBe: T): T {
	for (const key in data) {
		if (!(key in shouldBe)) {
			throw new WrongDataError(`unknown key ${key}`);
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
				ensure({test: item}, {test: toBe[0]});
			}
		} else if (typeof val == "object" && typeof toBe == "object" && val && toBe && !dataIsArray && !shouldBeArray) {
			ensure(val, toBe);
		}
	}
	return data as T;
}