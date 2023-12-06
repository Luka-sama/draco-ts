import {EnumDeclaration, SourceFile} from "ts-morph";
import BaseTypeInfo from "./base-type-info.js";
import SourceInfo from "./source-info.js";
import {Kind} from "./type-analyzer.typings.js";

/** A class that contains information about an enum */
export default class EnumInfo extends BaseTypeInfo {
	public static getKind(): Kind {
		return Kind.Enum;
	}

	public static getNodes(source: SourceFile): EnumDeclaration[] {
		return source.getEnums();
	}

	public constructor(node: EnumDeclaration, sourceInfo: SourceInfo, kindByUrlMap: Map<string, Kind>) {
		super(node, sourceInfo, kindByUrlMap);
		for (const memberNode of node.getMembers()) {
			const name = memberNode.getName();
			const typeNode = memberNode.getInitializer();
			const type = this.getPropertyType(typeNode, []);
			this.properties.push({name, optional: false, type, static: false});
		}
	}
}