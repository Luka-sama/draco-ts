import assert from "assert/strict";
import "dotenv/config";
import fs from "fs";
import path from "path";
import {Project, SourceFile, SyntaxKind} from "ts-morph";
import BaseTypeInfo from "./base-type-info.js";
import ClassInfo from "./class-info.js";
import EnumInfo from "./enum-info.js";
import InterfaceInfo from "./interface-info.js";
import TypeAliasInfo from "./type-alias-info.js";
import {TSNode} from "./type-analyzer.typings.js";

/** A class that contains information about a TypeScript source file */
export default class SourceInfo {
	/** The source path */
	public path: string;
	/** All ts-morph type nodes from this source file */
	public nodes: Map<typeof BaseTypeInfo, TSNode[]>;
	/**
	 * A map whose keys are original names (that are used in this source) of imported types in this source
	 * and values are export names (see {@link BaseTypeInfo.exportName})
	 */
	public exportMap: Map<string, string>;
	/**
	 * A map whose keys are original names (that are used in this source) of imported types in this source
	 * and values are full names (see {@link BaseTypeInfo.fullName})
	 */
	public importMap: Map<string, string>;
	/**
	 * A map whose keys are original names (that are used in this source) of imported types in this source
	 * and values are full names (see {@link BaseTypeInfo.fullName})
	 */
	public nameMapping: Map<string, string>;

	/** Returns all type info classes whose nodes should be extracted. Not as property to avoid cyclic references */
	public static getTypeList(): typeof BaseTypeInfo[] {
		return [TypeAliasInfo, InterfaceInfo, EnumInfo, ClassInfo];
	}

	/** Returns all source infos from this project */
	public static getSources(filePaths: string[]): SourceInfo[] {
		const tsConfigFilePath = process.env.TS_CONFIG_FILE_PATH || "tsconfig.json";
		const tsConfig = JSON.parse(fs.readFileSync(tsConfigFilePath, {encoding: "utf-8"}));
		const outDir: string = tsConfig.compilerOptions.outDir || "";
		return new Project({tsConfigFilePath, skipAddingFilesFromTsConfig: true})
			.addSourceFilesAtPaths(filePaths.map(filePath => path.join(outDir, filePath)))
			.map(source => new SourceInfo(source));
	}

	/**
	 * Returns the full name (see {@link BaseTypeInfo.fullName}) of a type
	 * (that is declared in a file located at `sourcePath`) by its export name
	 */
	public static getFullNameOfType(sourcePath: string, name?: string): string {
		return `import("${sourcePath}")` + (name !== undefined ? `.${name}` : "");
	}

	/** Creates an instance with all information about this source */
	public constructor(private source: SourceFile) {
		this.path = path.resolve(source.getFilePath().replace(/\.d\.ts$/, ".js"));
		this.nodes = this.getNodes();
		this.exportMap = this.getExportMap();
		this.importMap = this.getImportMap();
		this.nameMapping = this.getNameMapping();
	}

	/** Returns a full name (see {@link BaseTypeInfo.fullName}) of the given ts-morph type node */
	public getFullNameOfNode(node: TSNode): string {
		const name = node.getName() || "default";
		const exportName = (node.hasDefaultKeyword() ? "default" : this.exportMap.get(name) ?? name);
		return this.getFullNameOfType(exportName);
	}

	/**
	 * Returns the full name (see {@link BaseTypeInfo.fullName}) of a type
	 * (that is declared in this source file) by its export name
	 */
	public getFullNameOfType(exportName?: string): string {
		return SourceInfo.getFullNameOfType(this.path, exportName);
	}

	/** Collects and returns all ts-morph type nodes from this source file */
	private getNodes(): Map<typeof BaseTypeInfo, TSNode[]> {
		const nodes = new Map<typeof BaseTypeInfo, TSNode[]>;
		for (const TypeInfoClass of SourceInfo.getTypeList()) {
			nodes.set(TypeInfoClass, TypeInfoClass.getNodes(this.source));
		}
		return nodes;
	}

	/** Returns the calculated export map, see {@link SourceInfo.exportMap} */
	private getExportMap(): Map<string, string> {
		// Saving exports that are located separately from the declaration.
		// The methods isDefaultExport and similar are not used as they are too slow (takes 1 second to start up).
		// See this issue for details: https://github.com/dsherret/ts-morph/issues/644
		const exportMap = new Map<string, string>;

		for (const exportDeclaration of this.source.getExportDeclarations()) {
			for (const namedExport of exportDeclaration.getNamedExports()) {
				const origName = namedExport.getFirstChild()?.getText();
				const exportAs = namedExport.getLastChild()?.getText();
				assert(origName && exportAs, `An error occurred when analyzing exports of ${this.path}.`);
				exportMap.set(origName, exportAs);
			}
		}

		const exportAssignment = this.source.getStatementByKind(SyntaxKind.ExportAssignment)
			?.getChildrenOfKind(SyntaxKind.Identifier)[0]?.getText();
		if (exportAssignment) {
			exportMap.set(exportAssignment, "default");
		}

		return exportMap;
	}

	/** Returns the calculated import map, see {@link SourceInfo.importMap} */
	private getImportMap(): Map<string, string> {
		const importMap = new Map<string, string>;

		for (const importDeclarationNode of this.source.getImportDeclarations()) {
			const relativeModulePath = importDeclarationNode.getModuleSpecifierValue();
			const modulePath = (relativeModulePath[0] == "." ?
				path.join(path.dirname(this.path), relativeModulePath) :
				relativeModulePath
			);

			const namedBindings = importDeclarationNode.getImportClause()?.getNamedBindings()
				?.getChildrenOfKind(SyntaxKind.SyntaxList)[0]
				?.getChildrenOfKind(SyntaxKind.ImportSpecifier) || [];
			for (const importSpecifier of namedBindings) {
				const origName = importSpecifier.getFirstChild()!.getText();
				const importAs = importSpecifier.getLastChild()!.getText();
				const fullName = SourceInfo.getFullNameOfType(modulePath, origName);
				importMap.set(importAs, fullName);
			}

			const defaultImport = importDeclarationNode.getDefaultImport()?.getText();
			if (defaultImport) {
				const fullName = SourceInfo.getFullNameOfType(modulePath, "default");
				importMap.set(defaultImport, fullName);
			}

			const namespaceImport = importDeclarationNode.getNamespaceImport()?.getText();
			if (namespaceImport) {
				const fullName = SourceInfo.getFullNameOfType(namespaceImport);
				importMap.set(namespaceImport, fullName);
			}
		}

		return importMap;
	}

	/** Returns the calculated name mapping, see {@link SourceInfo.nameMapping} */
	private getNameMapping(): Map<string, string> {
		const nameMapping = new Map<string, string>;

		for (const [importAs, fullName] of this.importMap) {
			nameMapping.set(importAs, fullName);
		}

		for (const nodes of this.nodes.values()) {
			for (const node of nodes) {
				const name = node.getName() || "default";
				nameMapping.set(name, this.getFullNameOfNode(node));
			}
		}

		return nameMapping;
	}
}