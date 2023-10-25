import assert from "assert/strict";
import {ClassInstancePropertyTypes, Node, SourceFile, SyntaxKind, ts, TypeElementTypes} from "ts-morph";
import Logger from "../core/logger.js";
import SourceInfo from "./source-info.js";
import {Kind, PropertyInfo, PropertyType, TSNode} from "./type-analyzer.typings.js";

/**
 * A class that contains information about a type (such as a class or an enum).
 * This class itself should not be used. It wasn't made abstract to avoid TypeScript errors
 * when using a variable with type `typeof BaseTypeInfo` as a constructor.
 */
export default class BaseTypeInfo {
	private static readonly logger = new Logger(BaseTypeInfo);
	/** The original name that was used in the source file */
	public name: string;
	/** The name under which the type was exported, or the empty string if it wasn't exported */
	public exportName: string;
	/** The full name that consists of the source path and the export name. It's unique to the whole project */
	public fullName: string;
	/** The source path where this type was declared */
	public source: string;
	/** Whether this type was exported or not */
	public exported: boolean;
	/**
	 * The properties that this type contains.
	 * For some types (such as type aliases) it will only contain one property with the type description
	 */
	public properties: PropertyInfo[];

	/** Returns kind of this type. Not as property to avoid cyclic references */
	public static getKind() {
		return Kind.Unknown;
	}

	/** Returns all nodes of this type */
	public static getNodes(source: SourceFile): TSNode[] {
		return [];
	}

	/**
	 * Creates an instance and extracts the information from the given TSNode using `sourceInfo` and `kindByUrlMap`
	 * (see {@link SourceInfo} and {@link TypeAnalyzer.getKindByUrlMap} for details)
	 */
	public constructor(
		node: TSNode,
		private sourceInfo: SourceInfo,
		private kindByUrlMap: Map<string, Kind>,
	) {
		this.name = node.getName() || "default";
		this.exportName = (node.hasDefaultKeyword() ? "default" : sourceInfo.exportMap.get(this.name) ?? this.name);
		const fullName = sourceInfo.nameMapping.get(this.name);
		assert(fullName, `Name mapping for type ${this.name} not found.`);
		this.fullName = fullName;
		this.source = sourceInfo.path;
		this.exported = (node.hasExportKeyword() || sourceInfo.exportMap.has(this.name));
		this.properties = [];
		if (!this.exported) {
			this.exportName = "";
		}
	}

	/** Whether two type infos or a type info and a property type are equal */
	public equals(typeInfo: BaseTypeInfo | PropertyType) {
		return this.fullName == typeInfo.fullName;
	}

	/** Returns the full name of a type that was declared in the same source file */
	public getFullNameUsingMapping(name: string): string {
		const splitted = name.split(".");
		if (splitted.length > 1) {
			// Handles cases such as uWS.WebSocket
			const namespace = splitted.shift();
			assert(namespace);
			return (this.sourceInfo.nameMapping.get(namespace) ?? namespace) + "." + splitted.join(".");
		}
		return this.sourceInfo.nameMapping.get(name) ?? name;
	}

	/**
	 * Returns information about the given property info
	 * using type parameters and the info whether the property is static
	 */
	protected getPropertyInfo(
		propertyNode: ClassInstancePropertyTypes | TypeElementTypes, typeParameters: string[], isStatic: boolean
	): PropertyInfo | undefined {
		const typeNode = propertyNode.getChildren()
			.filter(node => !node.isKind(SyntaxKind.SemicolonToken)).at(-1);
		const modifierFlags = propertyNode.getCombinedModifierFlags();
		if (modifierFlags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected) ||
			typeNode?.isKind(SyntaxKind.PrivateIdentifier)) {
			return;
		}
		const name = ("getName" in propertyNode ? propertyNode.getName() : "");
		const optional = (propertyNode.getChildren().filter(node => node.isKind(SyntaxKind.QuestionToken)).length > 0);
		let type: PropertyType;
		if (propertyNode.isKind(SyntaxKind.MethodSignature)) {
			const returnType = this.getPropertyType(typeNode, typeParameters);
			type = {name, fullName: name, kind: Kind.Function, subtypes: [returnType]};
		} else {
			type = this.getPropertyType(typeNode, typeParameters);
		}

		return {name, optional, static: isStatic, type};
	}

	/**
	 * Returns {@link PropertyType} for this ts-morph Node using `typeParameters`.
	 * If `typeNode` is undefined, it returns `any`.
	 * The array `typeParameters` can be e.g. ["T", "U"] for a type `type SomeType<T, U> = ...`.
	 */
	protected getPropertyType(typeNode: Node | undefined, typeParameters: string[]): PropertyType {
		if (!typeNode || typeNode.isKind(SyntaxKind.AnyKeyword)) {
			return {name: "any", fullName: "any", kind: Kind.Any, subtypes: []};
		}
		const typeString = typeNode.getText();
		const literal = (typeNode.isKind(SyntaxKind.LiteralType) ? typeNode.getLiteral() : typeNode);

		if (typeNode.isKind(SyntaxKind.UnionType) || typeNode.isKind(SyntaxKind.IntersectionType)) {
			const kind = (typeNode.isKind(SyntaxKind.UnionType) ? Kind.Union : Kind.Intersection);
			const subtypes = typeNode.getTypeNodes().map(node => this.getPropertyType(node, typeParameters));
			return {name: "", fullName: "", kind, subtypes}
		}

		if (literal.isKind(SyntaxKind.NullKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Null, subtypes: []};
		}

		if (literal.isKind(SyntaxKind.NeverKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Never, subtypes: []};
		}

		if (literal.isKind(SyntaxKind.SymbolKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Symbol, subtypes: []};
		}

		if (literal.isKind(SyntaxKind.TrueKeyword) || literal.isKind(SyntaxKind.FalseKeyword) ||
			typeNode.isKind(SyntaxKind.BooleanKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Boolean, subtypes: []};
		}

		if (literal.isKind(SyntaxKind.NumericLiteral) || typeNode.isKind(SyntaxKind.NumberKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Number, subtypes: []};
		}

		if (literal.isKind(SyntaxKind.StringLiteral) || typeNode.isKind(SyntaxKind.StringKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.String, subtypes: []};
		}

		if (typeNode.isKind(SyntaxKind.TypeReference)) {
			const name = typeNode.getTypeName().getText();
			const fullName = (
				!typeParameters.includes(name) ? this.getFullNameUsingMapping(name) : name
			);
			const builtInClasses = [
				"Object", "Function", "Boolean", "Symbol",
				"Error", "AggregateError", "EvalError", "RangeError",
				"ReferenceError", "SyntaxError", "TypeError", "URIError",
				"Number", "BigInt", "Math", "Date",
				"String", "RegExp", "Intl",
				"Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array",
				"Uint32Array", "BigInt64Array", "BigUint64Array", "Float32Array", "Float64Array",
				"ArrayBuffer", "SharedArrayBuffer", "Atomics", "DataView", "JSON",
				"Map", "Set", "WeakMap", "WeakSet",
				"Promise", "Generator", "GeneratorFunction", "AsyncFunction", "AsyncGeneratorFunction",
				"Reflect", "Proxy",
				"AbortController", "AbortSignal", "Blob", "Buffer", "ByteLengthQueuingStrategy",
				"CompressionStream", "CountQueuingStrategy", "DecompressionStream", "File",
				"FormData", "Headers", "ReadableByteStreamController", "ReadableStream",
				"ReadableStreamBYOBReader", "ReadableStreamBYOBRequest", "ReadableStreamDefaultController",
				"ReadableStreamDefaultReader", "Request", "Response", "TextDecoder", "TextDecoderStream",
				"TextEncoder", "TextEncoderStream", "TransformStream",
				"TransformStreamDefaultController", "WritableStream",
				"BroadcastChannel", "Crypto", "CryptoKey", "CustomEvent", "Event", "EventTarget",
				"MessageChannel", "MessageEvent", "MessagePort", "Navigator", "PerformanceEntry",
				"PerformanceMark", "PerformanceMeasure", "PerformanceObserver", "PerformanceObserverEntryList",
				"PerformanceResourceTiming", "SubtleCrypto", "DOMException", "URL",
				"URLSearchParams", "WebAssembly", "WebSocket",
			];
			const utilityTypes = [
				"Awaited", "Partial", "Required", "Readonly", "Record", "Pick",
				"Omit", "Exclude", "Extract", "NonNullable", "Parameters",
				"ConstructorParameters", "ReturnType", "InstanceType",
				"ThisParameterType", "OmitThisParameter", "ThisType",
				"Uppercase", "Lowercase", "Capitalize", "Uncapitalize",
			];
			let kind = Kind.Unknown;
			if (typeParameters.includes(name)) {
				kind = Kind.TypeParameter;
			} else if (name != fullName) {
				kind = this.kindByUrlMap.get(fullName) ?? Kind.Unknown;
			} else if (name == "Array") {
				kind = Kind.Array;
			} else if (builtInClasses.includes(name)) {
				kind = Kind.BuiltInClass;
			} else if (utilityTypes.includes(name)) {
				kind = Kind.UtilityType;
			}

			const subtypes: PropertyType[] = typeNode
				.getChildrenOfKind(SyntaxKind.SyntaxList)[0]?.getChildren()
				.filter(node => !node.isKind(SyntaxKind.CommaToken))
				.map(node => this.getPropertyType(node, typeParameters)) || [];
			if (kind == Kind.Unknown) {
				BaseTypeInfo.logger.debug(`Unknown type reference ${typeString}.`);
			}
			return {name, fullName, kind, subtypes};
		}

		if (typeNode.isKind(SyntaxKind.TypeLiteral)) {
			const subtypes: PropertyType[] = typeNode
				.getChildrenOfKind(SyntaxKind.SyntaxList)[0]?.getChildren()
				.map(node => this.getPropertyType(node, typeParameters)) || [];
			return {name: "", fullName: "", kind: Kind.Object, subtypes};
		}

		if (typeNode.isKind(SyntaxKind.PropertySignature)) {
			const name = typeNode.getName();
			const subtypeNode = typeNode.getTypeNode();
			const value = this.getPropertyType(subtypeNode, typeParameters);
			return {name, fullName: name, kind: Kind.ObjectProperty, subtypes: [value]};
		}

		if (typeNode.isKind(SyntaxKind.IndexSignature)) {
			const name = typeNode.getKeyName();
			const keyType = this.getPropertyType(typeNode.getKeyTypeNode(), typeParameters);
			const propertyType = this.getPropertyType(typeNode.getReturnTypeNode(), typeParameters);
			return {name, fullName: name, kind: Kind.IndexSignature, subtypes: [keyType, propertyType]};
		}

		if (typeNode.isKind(SyntaxKind.MappedType)) {
			const keyNode = typeNode.getChildrenOfKind(SyntaxKind.TypeParameter)[0];
			const name = keyNode.getName();
			const keyType = this.getPropertyType(keyNode.getConstraint(), typeParameters);
			const propertyType = this.getPropertyType(typeNode.getTypeNode(), typeParameters);
			return {name, fullName: name, kind: Kind.MappedType, subtypes: [keyType, propertyType]};
		}

		if (typeNode.isKind(SyntaxKind.ArrayType)) {
			const subtypeNode = typeNode.getElementTypeNode();
			const type = this.getPropertyType(subtypeNode, typeParameters);
			return {name: "", fullName: "", kind: Kind.Array, subtypes: [type]};
		}

		if (typeNode.isKind(SyntaxKind.TupleType)) {
			const subtypes = [];
			for (const tupleMember of typeNode.getElements()) {
				if (tupleMember.isKind(SyntaxKind.NamedTupleMember)) {
					const name = tupleMember.getName();
					const type = this.getPropertyType(tupleMember.getTypeNode(), typeParameters);
					subtypes.push({name, fullName: name, kind: Kind.NamedTupleMember, subtypes: [type]});
				} else {
					const type = this.getPropertyType(tupleMember, typeParameters);
					subtypes.push(type);
				}
			}
			return {name: "", fullName: "", kind: Kind.Tuple, subtypes};
		}

		if (typeNode.isKind(SyntaxKind.ParenthesizedType)) {
			return this.getPropertyType(typeNode.getTypeNode(), typeParameters);
		}

		if (typeNode.isKind(SyntaxKind.FunctionType) || typeNode.isKind(SyntaxKind.ConstructorType)) {
			return {name: typeString, fullName: typeString, kind: Kind.Function, subtypes: []};
		}

		if (typeNode.isKind(SyntaxKind.TypeQuery)) {
			const name = typeNode.getExprName().getText();
			const fullName = this.getFullNameUsingMapping(name);
			if (name != fullName) {
				const kind = this.kindByUrlMap.get(fullName) ?? Kind.Unknown;
				const subtypes: PropertyType[] = typeNode
					.getChildrenOfKind(SyntaxKind.SyntaxList)[0]?.getChildren()
					.filter(node => !node.isKind(SyntaxKind.CommaToken))
					.map(node => this.getPropertyType(node, typeParameters)) || [];
				return {name: "", fullName: "", kind: Kind.Typeof, subtypes: [{name, fullName, kind, subtypes}]};
			}
			return {name, fullName: name, kind: Kind.Typeof, subtypes: []};
		}

		if (typeNode.isKind(SyntaxKind.TypeOperator)) {
			const operator = typeNode.getOperator();
			const type = this.getPropertyType(typeNode.getTypeNode(), typeParameters);
			const name = {
				[SyntaxKind.KeyOfKeyword]: "keyof",
				[SyntaxKind.ReadonlyKeyword]: "readonly",
				[SyntaxKind.UniqueKeyword]: "unique",
			}[operator];
			return {name, fullName: name, kind: Kind.TypeOperator, subtypes: [type]};
		}

		if (literal.isKind(SyntaxKind.BigIntLiteral) || typeNode.isKind(SyntaxKind.BigIntKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.BigInt, subtypes: []};
		}

		if (literal.isKind(SyntaxKind.UndefinedKeyword) || literal.isKind(SyntaxKind.VoidKeyword)) {
			return {name: typeString, fullName: typeString, kind: Kind.Undefined, subtypes: []};
		}

		BaseTypeInfo.logger.debug(`Unknown type ${typeString}.`);
		return {name: typeString, fullName: typeString, kind: Kind.Unknown, subtypes: []};
	}
}