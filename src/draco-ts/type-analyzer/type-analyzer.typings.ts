import {ExportableNode, NameableNode, NamedNode, Node} from "ts-morph";

/** An enum to distinguish between different types */
export enum Kind {
	Null = "null",
	Undefined = "undefined",
	Boolean = "boolean",
	Number = "number",
	String = "string",
	BigInt = "bigInt",
	Symbol = "symbol",
	Object = "object",
	ObjectProperty = "objectProperty",
	IndexSignature = "indexSignature",
	MappedType = "mappedType",
	Array = "array",
	Tuple = "tuple",
	NamedTupleMember = "namedTupleMember",
	Function = "function",
	Class = "class",
	BuiltInClass = "builtInClass",
	UtilityType = "utilityType",
	Interface = "interface",
	TypeAlias = "typeAlias",
	Enum = "enum",
	Union = "union",
	Intersection = "intersection",
	TypeParameter = "typeParameter",
	ImportedFromNodeModules = "importedFromNodeModules",
	Typeof = "typeof",
	TypeOperator = "typeOperator",
	Never = "never",
	Any = "any",
	Unknown = "unknown",
}

/** An interface with information about a type */
export interface PropertyType {
	name: string;
	fullName: string;
	kind: Kind;
	subtypes: PropertyType[];
}

/** An interface with information about a property, see {@link BaseTypeInfo.properties} */
export interface PropertyInfo {
	name: string;
	optional: boolean;
	static: boolean;
	type: PropertyType;
}

/**
 * A ts-morph node for some type (such as class, type alias, etc.)
 * @internal
 */
export type TSNode = (NamedNode | NameableNode) & ExportableNode & Node;