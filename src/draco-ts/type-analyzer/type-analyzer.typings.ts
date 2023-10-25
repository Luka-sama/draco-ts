import {ExportableNode, NameableNode, NamedNode, Node} from "ts-morph";

/**
 * An enum to distinguish between different types.
 * {@link Kind.Unidentified} means that the type analyzer doesn't know this type.
 * See also {@link PropertyType} for details
 */
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
	Unidentified = "unidentified",
}

/**
 * An interface with information about a type. It's not always obvious what the properties can contain,
 * so it would be the best option to explore the tests for {@link ClassInfo} as they contain a lot of examples.
 * As a rule of thumb, `name` only contains what the code also contains.
 * So if you write `number[]`, `name` will be an empty string. If you write `Array<number>`, `name` will be `Array`.
 */
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