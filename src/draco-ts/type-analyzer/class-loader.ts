import assert from "assert/strict";
import path from "path";
import {fileURLToPath} from "url";
import {Class} from "../typings.js";
import ClassInfo, {ClassWithInfo} from "./class-info.js";
import TypeAnalyzer from "./type-analyzer.js";

/** A class that connects the classes and the class infos about them */
export default class ClassLoader {
	/** Imports a class by the given full name */
	public static async importByFullName(fullName: string): Promise<Class> {
		const typeInfo = TypeAnalyzer.getByFullName(fullName);
		assert(typeInfo instanceof ClassInfo, `${fullName} is not a class.`);
		return await ClassLoader.import(typeInfo);
	}

	/** Imports a class by the given full name. Returns a tuple with the class and the info about it */
	public static async importByFullNameWithInfo(fullName: string): Promise<ClassWithInfo> {
		const typeInfo = TypeAnalyzer.getByFullName(fullName);
		assert(typeInfo instanceof ClassInfo, `${fullName} is not a class.`);
		return [await ClassLoader.import(typeInfo), typeInfo];
	}

	/** Imports a class by the given class info */
	public static async import(classInfo: ClassInfo): Promise<Class> {
		assert(classInfo.exported, `Tried to import class ${classInfo.fullName} that is not exported.`);
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const importUrl = path.relative(currentDir, classInfo.source).replace(/\\/g, "/");
		const imported = await import( (importUrl[0] == "." ? importUrl : `./${importUrl}`) );
		return imported[classInfo.exportName];
	}

	/** Imports a class by the given class info. Returns a tuple with the class and the info about it */
	public static async importWithInfo(classInfo: ClassInfo): Promise<ClassWithInfo> {
		return [await ClassLoader.import(classInfo), classInfo];
	}

	/** Returns a class info for the given class or returns `undefined`, if it wasn't found */
	public static async find(ClassToFind: Class): Promise<ClassInfo | undefined> {
		const nameToFind = (ClassToFind.name || "default");
		for (const typeInfo of TypeAnalyzer.getAllTypes()) {
			if (typeInfo instanceof ClassInfo && typeInfo.name == nameToFind &&
				(await ClassLoader.import(typeInfo)) == ClassToFind) {
				return typeInfo;
			}
		}
	}

	/** Returns a tuple with the given class and the info about it or `undefined`, if the info wasn't found */
	public static async findWithInfo(ClassToFind: Class): Promise<ClassWithInfo | undefined> {
		const classInfo = await ClassLoader.find(ClassToFind);
		return (classInfo ? [ClassToFind, classInfo] : undefined);
	}

	/** Returns a class info for the given class or throws an exception, if it wasn't found */
	public static async findOrThrow(ClassToFind: Class): Promise<ClassInfo> {
		const typeInfo = await ClassLoader.find(ClassToFind);
		assert(typeInfo, `Class ${ClassToFind.name || "default"} was not found.`);
		return typeInfo;
	}

	/** Returns a tuple with the given class and the info about it or throws an exception, if the info wasn't found */
	public static async findOrThrowWithInfo(ClassToFind: Class): Promise<ClassWithInfo> {
		return [ClassToFind, await ClassLoader.findOrThrow(ClassToFind)];
	}
}