import assert from "assert/strict";
import fs from "fs";
import path from "path";
import {ClassDeclaration, ClassInstancePropertyTypes, Node, Project, SourceFile, SyntaxKind, ts} from "ts-morph";
import {fileURLToPath} from "url";
import {Class} from "./typings.js";

export enum Kind {
	Null,
	Undefined,
	Boolean,
	Number,
	String,
	BigInt,
	Symbol,
	Object,
	ObjectProperty,
	Array,
	Function,
	Class,
	TypeAlias,
	Interface,
	Union,
	Any,
	Unknown,
}

export interface PropertyType {
	name: string;
	fullName: string;
	kind: Kind;
	typeVariables: PropertyType[];
}

export interface PropertyInfo {
	name: string;
	type: PropertyType;
	optional: boolean;
}

export interface ClassInfo {
	name: string;
	exportName: string;
	fullName: string;
	source: string;
	extends?: string;
	fullExtends?: string;
	abstract: boolean;
	properties: PropertyInfo[],
}

export default class ClassAnalyzer {
	private static classes = new Map<string, ClassInfo>;

	public static async init() {
		const sources = ClassAnalyzer.getSources();
		const kindByUrlMap = ClassAnalyzer.getKindByUrlMap(sources);

		for (const source of sources) {
			// The method isDefaultExport is not used as it is too slow (takes 1 second to start up).
			// See this issue for details: https://github.com/dsherret/ts-morph/issues/644
			const {sourcePath, exportAssignment} = ClassAnalyzer.getSourceInfo(source);
			const nameMapping = ClassAnalyzer.getNameMapping(source, sourcePath, exportAssignment);

			for (const classNode of source.getClasses()) {
				const classInfo = ClassAnalyzer.getClassInfo(classNode, nameMapping, kindByUrlMap, sourcePath, exportAssignment);
				ClassAnalyzer.classes.set(classInfo.fullName, classInfo);
			}
		}
	}

	public static async getDerivedClassesOf(baseClass: Class): Promise<ClassInfo[]> {
		const baseClassInfo = await ClassAnalyzer.findClassInfo(baseClass);
		assert(baseClassInfo, `Class ${baseClass.name} not found.`);

		const result: ClassInfo[] = [];
		for (const classInfo of ClassAnalyzer.classes.values()) {
			if (ClassAnalyzer.isDerived(classInfo, baseClassInfo)) {
				result.push(classInfo);
			}
		}
		return result;
	}

	public static areTypesEqual(type: PropertyInfo | PropertyType, source: ClassInfo | string, name: string) {
		source = (typeof source == "string" ? source : source.source);
		return ("fullName" in type ? type.fullName : type.type.fullName) == ClassAnalyzer.getFullName(source, name);
	}

	public static async findClassInfo(classToFind: Class): Promise<ClassInfo | undefined> {
		const nameToFind = (classToFind.name || "default");
		for (const classInfo of ClassAnalyzer.classes.values()) {
			if (classInfo.name == nameToFind && (await ClassAnalyzer.importClass(classInfo)) == classToFind) {
				return classInfo;
			}
		}
	}

	public static findByFullName(fullName: string): ClassInfo | undefined {
		return ClassAnalyzer.classes.get(fullName);
	}

	public static async importClassByFullName(fullName: string): Promise<Class | null> {
		const classInfo = ClassAnalyzer.classes.get(fullName);
		return (classInfo ? await ClassAnalyzer.importClass(classInfo) : null);
	}

	public static async importClass(classInfo: ClassInfo): Promise<Class> {
		const importUrl = ClassAnalyzer.getImportUrl(classInfo);
		return (await import(importUrl))[classInfo.exportName];
	}

	public static getImportUrl(classInfo: ClassInfo): string {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const importUrl = path.relative(currentDir, classInfo.source).replace(/\\/g, "/");
		return (importUrl[0] == "." ? importUrl : `./${importUrl}`);
	}

	public static isDerived(classToCheck: ClassInfo, baseClass: ClassInfo): boolean {
		if (!classToCheck.fullExtends) {
			return false;
		} else if (classToCheck.fullExtends == baseClass.fullName) {
			return true;
		}

		const parent = ClassAnalyzer.classes.get(classToCheck.fullExtends);
		assert(parent, `Parent class ${classToCheck.fullExtends} not found.`);
		return ClassAnalyzer.isDerived(parent, baseClass);
	}

	public static getFullName(url: string, name?: string): string {
		return `import("${url}")` + (name !== undefined ? `.${name}` : "");
	}

	private static getSources(): SourceFile[] {
		const tsConfigFilePath = process.env.TS_CONFIG_FILE_PATH || "tsconfig.json";
		const tsConfig = JSON.parse(fs.readFileSync(tsConfigFilePath, {encoding: "utf-8"}));
		const sourceFilesPaths = path.join(tsConfig.compilerOptions.outDir || "", "**/*.d.ts");
		const project = new Project({tsConfigFilePath, skipAddingFilesFromTsConfig: true});
		return project.addSourceFilesAtPaths(sourceFilesPaths);
	}

	private static getKindByUrlMap(sources: SourceFile[]): Map<string, Kind> {
		const kindByUrlMap = new Map<string, Kind>;

		for (const source of sources) {
			const {sourcePath, exportAssignment} = ClassAnalyzer.getSourceInfo(source);

			for (const typeAliasNode of source.getTypeAliases()) {
				const fullName = ClassAnalyzer.getFullName(sourcePath, typeAliasNode.getName());
				kindByUrlMap.set(fullName, Kind.TypeAlias);
			}

			for (const interfaceNode of source.getInterfaces()) {
				const fullName = ClassAnalyzer.getFullName(sourcePath, interfaceNode.getName());
				kindByUrlMap.set(fullName, Kind.Interface);
			}

			for (const classNode of source.getClasses()) {
				const className = classNode.getName() || "default";
				const isDefaultExport = (classNode.hasDefaultKeyword() || exportAssignment == className);
				const fullName = ClassAnalyzer.getFullName(sourcePath, (isDefaultExport ? "default" : className));
				kindByUrlMap.set(fullName, Kind.Class);
			}
		}

		return kindByUrlMap;
	}

	private static getSourceInfo(source: SourceFile): {sourcePath: string, exportAssignment?: string} {
		const sourcePath = path.resolve(source.getFilePath().replace(/\.d\.ts$/, ".js"));
		const exportAssignment = source.getStatementByKind(SyntaxKind.ExportAssignment)
			?.getChildrenOfKind(SyntaxKind.Identifier)[0]?.getText();
		return {sourcePath, exportAssignment};
	}

	private static getNameMapping(source: SourceFile, sourcePath: string, exportAssignment?: string): Map<string, string> {
		const nameMapping = new Map<string, string>;

		for (const importDeclarationNode of source.getImportDeclarations()) {
			const relativeModulePath = importDeclarationNode.getModuleSpecifierValue();
			const modulePath = (
				relativeModulePath[0] == "." ? path.join(path.dirname(sourcePath), relativeModulePath) : relativeModulePath
			);

			const namedBindings = importDeclarationNode.getImportClause()?.getNamedBindings()
				?.getChildrenOfKind(SyntaxKind.SyntaxList)[0]
				?.getChildrenOfKind(SyntaxKind.ImportSpecifier) || [];
			for (const importSpecifier of namedBindings) {
				const origName = importSpecifier.getFirstChild()!.getText();
				const importAs = importSpecifier.getLastChild()!.getText();
				nameMapping.set(importAs, ClassAnalyzer.getFullName(modulePath, origName));
			}

			const defaultImport = importDeclarationNode.getDefaultImport()?.getText();
			if (defaultImport) {
				nameMapping.set(defaultImport, ClassAnalyzer.getFullName(modulePath, "default"));
			}

			const namespaceImport = importDeclarationNode.getNamespaceImport()?.getText();
			if (namespaceImport) {
				nameMapping.set(namespaceImport, ClassAnalyzer.getFullName(namespaceImport));
			}
		}

		for (const typeAliasNode of source.getTypeAliases()) {
			const typeAliasName = typeAliasNode.getName();
			nameMapping.set(typeAliasName, ClassAnalyzer.getFullName(sourcePath, typeAliasName));
		}

		for (const interfaceNode of source.getInterfaces()) {
			const interfaceName = interfaceNode.getName();
			nameMapping.set(interfaceName, ClassAnalyzer.getFullName(sourcePath, interfaceName));
		}

		for (const classNode of source.getClasses()) {
			const className = classNode.getName() || "default";
			const isDefaultExport = (classNode.hasDefaultKeyword() || exportAssignment == className);
			nameMapping.set(className, ClassAnalyzer.getFullName(sourcePath, (isDefaultExport ? "default" : className)));
		}

		return nameMapping;
	}

	private static getClassInfo(
		classNode: ClassDeclaration, nameMapping: Map<string, string>, kindByUrlMap: Map<string, Kind>,
		source: string, exportAssignment?: string
	): ClassInfo {
		const name = classNode.getName() || "default";
		const exportName = (classNode.hasDefaultKeyword() || exportAssignment == name ? "default" : name);
		const fullName = nameMapping.get(name);
		assert(fullName, `Name mapping for class ${name} not found.`);
		const classExtends = classNode.getExtends()?.getChildrenOfKind(SyntaxKind.Identifier)[0]?.getText();
		const fullExtends = (classExtends ? nameMapping.get(classExtends) : undefined);
		const isAbstract = classNode.hasModifier(SyntaxKind.AbstractKeyword);
		const properties: PropertyInfo[] = [];

		for (const propertyNode of classNode.getInstanceProperties()) {
			const modifierFlags = propertyNode.getCombinedModifierFlags();
			if (modifierFlags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) {
				continue;
			}
			const propertyInfo = ClassAnalyzer.getPropertyInfo(propertyNode, nameMapping, kindByUrlMap);
			properties.push(propertyInfo);
		}

		return {name, exportName, fullName, source, extends: classExtends, fullExtends, abstract: isAbstract, properties};
	}

	private static getPropertyInfo(
		propertyNode: ClassInstancePropertyTypes, nameMapping: Map<string, string>, kindByUrlMap: Map<string, Kind>
	): PropertyInfo {
		const name = propertyNode.getName();
		const typeNode = propertyNode.getChildren().filter(node => !node.isKind(SyntaxKind.SemicolonToken)).at(-1);
		const optional = !!(
			// Detects e.g. myproperty?: number;
			propertyNode.getChildren().filter(node => node.isKind(SyntaxKind.QuestionToken)).length ||
			// Detects e.g. myproperty: number | undefined;
			typeNode?.isKind(SyntaxKind.UnionType) && typeNode.getTypeNodes().filter(node => node.isKind(SyntaxKind.UndefinedKeyword)).length
		);
		const type = ClassAnalyzer.getPropertyType(typeNode, nameMapping, kindByUrlMap);

		return {name, type, optional};
	}

	private static getPropertyType(
		typeNode: Node | undefined, nameMapping: Map<string, string>, kindByUrlMap: Map<string, Kind>
	): PropertyType {
		if (!typeNode || typeNode.isKind(SyntaxKind.AnyKeyword)) {
			return {name: "any", fullName: "any", kind: Kind.Any, typeVariables: []};
		}

		if (typeNode.isKind(SyntaxKind.UnionType)) {
			const types = typeNode.getTypeNodes()
				.filter(node => !node.isKind(SyntaxKind.UndefinedKeyword))
				.map(node => ClassAnalyzer.getPropertyType(node, nameMapping, kindByUrlMap));
			if (types.length == 1) {
				return types[0];
			}
			return (types.length > 0 ?
				{name: "", fullName: "", kind: Kind.Union, typeVariables: types} :
				{name: "undefined", fullName: "undefined", kind: Kind.Undefined, typeVariables: []}
			);
		}

		const typeString = typeNode.getText();
		const isLiteral = typeNode.isKind(SyntaxKind.LiteralType);
		if (typeNode.isKind(SyntaxKind.NullKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Null, typeVariables: []};
		}

		if (typeNode.isKind(SyntaxKind.UndefinedKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Undefined, typeVariables: []};
		}

		if (typeNode.isKind(SyntaxKind.SymbolKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Symbol, typeVariables: []};
		}

		if (typeNode.isKind(SyntaxKind.TrueKeyword) || typeNode.isKind(SyntaxKind.FalseKeyword) ||
			typeNode.isKind(SyntaxKind.BooleanKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Boolean, typeVariables: []};
		}

		if (isLiteral && typeNode.getLiteral().isKind(SyntaxKind.NumericLiteral) ||
			typeNode.isKind(SyntaxKind.NumberKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Number, typeVariables: []};
		}

		if (isLiteral && typeNode.getLiteral().isKind(SyntaxKind.StringLiteral) ||
			typeNode.isKind(SyntaxKind.StringKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.String, typeVariables: []};
		}

		if (typeNode.isKind(SyntaxKind.TypeReference)) {
			const name = typeNode.getTypeName().getText();
			const fullName = nameMapping.get(name) || name;
			const kind = kindByUrlMap.get(fullName) ?? Kind.Unknown;
			const typeVariables: PropertyType[] = typeNode
				.getChildrenOfKind(SyntaxKind.SyntaxList)[0]?.getChildren()
				.filter(node => !node.isKind(SyntaxKind.CommaToken))
				.map(node => ClassAnalyzer.getPropertyType(node, nameMapping, kindByUrlMap)) || [];
			return {name, fullName, kind, typeVariables};
		}

		if (typeNode.isKind(SyntaxKind.TypeLiteral)) {
			const typeVariables: PropertyType[] = typeNode
				.getChildrenOfKind(SyntaxKind.SyntaxList)[0]?.getChildren()
				.map(node => ClassAnalyzer.getPropertyType(node, nameMapping, kindByUrlMap)) || [];
			return {name: "", fullName: "", kind: Kind.Object, typeVariables};
		}

		if (typeNode.isKind(SyntaxKind.PropertySignature)) {
			const name = typeNode.getName();
			const value = ClassAnalyzer.getPropertyType(typeNode.getTypeNode(), nameMapping, kindByUrlMap);
			return {name, fullName: name, kind: Kind.ObjectProperty, typeVariables: [value]};
		}

		if (typeNode.isKind(SyntaxKind.ArrayType)) {
			const type = ClassAnalyzer.getPropertyType(typeNode.getElementTypeNode(), nameMapping, kindByUrlMap);
			return {name: "", fullName: "", kind: Kind.Array, typeVariables: [type]};
		}

		if (typeNode.isKind(SyntaxKind.ParenthesizedType)) {
			return ClassAnalyzer.getPropertyType(typeNode.getTypeNode(), nameMapping, kindByUrlMap);
		}

		if (typeNode.isKind(SyntaxKind.FunctionType)) {
			return {name: typeString, fullName: typeString, kind: Kind.Function, typeVariables: []};
		}

		if (isLiteral && typeNode.getLiteral().isKind(SyntaxKind.BigIntLiteral) ||
			typeNode.isKind(SyntaxKind.BigIntKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.BigInt, typeVariables: []};
		}

		return {name: typeString, fullName: typeString, kind: Kind.Unknown, typeVariables: []};
	}
}