import assert from "assert/strict";
import path from "path";
import {fileURLToPath} from "url";
import {Class} from "../typings.js";
import ClassInfo from "./class-info.js";
import TypeAnalyzer from "./type-analyzer.js";

/** A class that connects the classes and the class infos about them */
export default class ClassLoader {
	/** Imports a class by the given full name */
	public static async importByFullName(fullName: string): Promise<Class> {
		const typeInfo = TypeAnalyzer.getByFullName(fullName);
		assert(typeInfo instanceof ClassInfo, `${fullName} is not a class.`);
		return await ClassLoader.import(typeInfo);
	}

	/** Imports a class by the given class info */
	public static async import(classInfo: ClassInfo): Promise<Class> {
		assert(classInfo.exported, `Tried to import class ${classInfo.fullName} that is not exported.`);
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const importUrl = path.relative(currentDir, classInfo.source).replace(/\\/g, "/");
		const imported = await import( (importUrl[0] == "." ? importUrl : `./${importUrl}`) );
		return imported[classInfo.exportName];
	}

	/** Returns a class info for the given class or returns `undefined`, if it wasn't found */
	public static async find(classToFind: Class): Promise<ClassInfo | undefined> {
		const nameToFind = (classToFind.name || "default");
		for (const typeInfo of TypeAnalyzer.getAllTypes()) {
			if (typeInfo instanceof ClassInfo && typeInfo.name == nameToFind &&
				(await ClassLoader.import(typeInfo)) == classToFind) {
				return typeInfo;
			}
		}
	}

	/** Returns a class info for the given class or throws an exception, if it wasn't found */
	public static async findOrThrow(classToFind: Class): Promise<ClassInfo> {
		const typeInfo = await ClassLoader.find(classToFind);
		assert(typeInfo, `Class ${classToFind.name || "default"} was not found.`);
		return typeInfo;
	}
}