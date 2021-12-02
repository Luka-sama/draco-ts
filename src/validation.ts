import {ClassType, transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";

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