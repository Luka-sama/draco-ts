import {randomBytes} from "crypto";
import {promisify} from "util";

/** Returns the given string without change. Used to extract strings (with PyBabel) that require translation **/
export function tr(str: string): string {
	return str;
}

/** Generates random token for authentication **/
export async function getToken() {
	return (await promisify(randomBytes)(48)).toString("hex");
}