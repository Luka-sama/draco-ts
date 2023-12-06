import assert from "assert/strict";
import {InterfaceDeclaration, SourceFile} from "ts-morph";
import BaseTypeInfo from "./base-type-info.js";
import SourceInfo from "./source-info.js";
import {Kind} from "./type-analyzer.typings.js";

/** A class that contains information about an interface */
export default class InterfaceInfo extends BaseTypeInfo {
	/** An array with the names (that were used in this source file) of all interfaces that this interface extends */
	public extends: string[];
	/**
	 * An array with the full names (see {@link BaseTypeInfo.fullName}) of all interfaces that this interface extends.
	 * They are in the same order as in {@link InterfaceInfo.extends}
	 */
	public fullExtends: string[];

	public static getKind(): Kind {
		return Kind.Interface;
	}

	public static getNodes(source: SourceFile): InterfaceDeclaration[] {
		return source.getInterfaces();
	}

	public constructor(node: InterfaceDeclaration, sourceInfo: SourceInfo, kindByUrlMap: Map<string, Kind>) {
		super(node, sourceInfo, kindByUrlMap);
		this.extends = [];
		this.fullExtends = [];
		for (const extendsNode of node.getExtends()) {
			const interfaceExtends = extendsNode.getExpression().getText();
			const fullExtends = this.getFullNameUsingMapping(interfaceExtends);
			assert(interfaceExtends && fullExtends, `An error occurred when analyzing interface ${this.fullName}.`);
			this.extends.push(interfaceExtends);
			this.fullExtends.push(fullExtends);
		}

		const typeParameters = node.getTypeParameters().map(typeParameter => typeParameter.getName());
		for (const memberNode of node.getMembers()) {
			const memberInfo = this.getPropertyInfo(memberNode, typeParameters, false);
			if (memberInfo) {
				this.properties.push(memberInfo);
			}
		}
	}
}