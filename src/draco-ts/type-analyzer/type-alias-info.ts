import {SourceFile, TypeAliasDeclaration} from "ts-morph";
import BaseTypeInfo from "./base-type-info.js";
import SourceInfo from "./source-info.js";
import {Kind} from "./type-analyzer.typings.js";

/** A class that contains information about a type alias */
export default class TypeAliasInfo extends BaseTypeInfo {
	public static getKind() {
		return Kind.TypeAlias;
	}

	public static getNodes(source: SourceFile): TypeAliasDeclaration[] {
		return source.getTypeAliases();
	}

	public constructor(node: TypeAliasDeclaration, sourceInfo: SourceInfo, kindByUrlMap: Map<string, Kind>) {
		super(node, sourceInfo, kindByUrlMap);
		const typeParameters = node.getTypeParameters().map(typeParameter => typeParameter.getName());
		const typeNode = node.getTypeNode();
		const type = this.getPropertyType(typeNode, typeParameters);
		this.properties.push({name: "", optional: false, type, static: false});
	}
}