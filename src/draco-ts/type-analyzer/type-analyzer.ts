import assert from "assert/strict";
import BaseTypeInfo from "./base-type-info.js";
import SourceInfo from "./source-info.js";
import {Kind} from "./type-analyzer.typings.js";

/**
 * This class collects the information about all types (such as classes, enums, interfaces, etc.) used in this project.
 * All collected types are listed in {@link SourceInfo.getTypeList}.
 *
 * You should consider the following:
 * - For performance reasons, the analyzer uses the information from .d.ts-files.
 * As a result, the analyzer can only see the exported types. The only exception are not exported types
 * that are used in other (exported) types.
 * - You can't get the information about a non-class type by its name, as the project can contain multiple types
 * with the same name, and it is generally a bad idea to store source path in the code as a string
 * as it will not be updated by IDE during a refactoring. If you want to get this information, you will need
 * to export a class (a stub class, if necessary). Then you can get the information about the types
 * from the same source file using {@link ClassLoader.find} first and then {@link TypeAnalyzer.getFromFile}.
 */
export default class TypeAnalyzer {
	/** A map whose keys are full names (see {@link BaseTypeInfo.fullName} and values are type infos */
	private static readonly types = new Map<string, BaseTypeInfo>;

	/**
	 * Initializes TypeAnalyzer, i.e. extracts information
	 * about all classes, enums, interfaces, etc. used in the project
	 */
	public static init(): void {
		const sources = SourceInfo.getSources();
		const kindByUrlMap = TypeAnalyzer.getKindByUrlMap(sources);

		for (const sourceInfo of sources) {
			for (const [TypeInfoClass, nodes] of sourceInfo.nodes) {
				for (const node of nodes) {
					const typeInfo = new TypeInfoClass(node, sourceInfo, kindByUrlMap);
					assert(!TypeAnalyzer.types.has(typeInfo.fullName), `The type ${typeInfo.fullName} is duplicated.`);
					TypeAnalyzer.types.set(typeInfo.fullName, typeInfo);
				}
			}
		}
	}

	/** Stops TypeAnalyzer, i.e. frees the memory from the collected information */
	public static stop(): void {
		TypeAnalyzer.types.clear();
	}

	public static getFromFile(typeInfo: BaseTypeInfo, names: string): BaseTypeInfo;

	public static getFromFile(typeInfo: BaseTypeInfo, names: string[]): BaseTypeInfo[];

	/**
	 * Given a type info, it returns other type info(s) for the types
	 * from the same source file by the name(s) used in this file
	 */
	public static getFromFile(typeInfo: BaseTypeInfo, names: string | string[]): BaseTypeInfo | BaseTypeInfo[] {
		if (names instanceof Array) {
			return names.map(name => TypeAnalyzer.getFromFile(typeInfo, name));
		}
		const fullName = typeInfo.getFullNameUsingMapping(names);
		return TypeAnalyzer.getByFullName(fullName);
	}

	/** Returns a type info by a full name (see {@link BaseTypeInfo.fullName}) */
	public static getByFullName(fullName: string): BaseTypeInfo {
		const typeInfo = TypeAnalyzer.types.get(fullName);
		assert(typeInfo, `The type ${fullName} is not found.`);
		return typeInfo;
	}

	/** Returns an array with all collected types */
	public static getAllTypes(): BaseTypeInfo[] {
		return Array.from(TypeAnalyzer.types.values());
	}

	/** Returns a map whose keys are full names (see {@link BaseTypeInfo.fullName} and values are {@link Kind} */
	private static getKindByUrlMap(sources: SourceInfo[]): Map<string, Kind> {
		const kindByUrlMap = new Map<string, Kind>;

		for (const sourceInfo of sources) {
			for (const fullName of sourceInfo.importMap.values()) {
				if (!kindByUrlMap.has(fullName)) {
					kindByUrlMap.set(fullName, Kind.ImportedFromNodeModules);
				}
			}

			for (const [TypeInfoClass, nodes] of sourceInfo.nodes) {
				for (const node of nodes) {
					const fullName = sourceInfo.getFullNameOfNode(node);
					kindByUrlMap.set(fullName, TypeInfoClass.getKind());
				}
			}
		}

		return kindByUrlMap;
	}
}