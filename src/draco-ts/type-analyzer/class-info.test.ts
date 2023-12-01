import assert from "assert/strict";
import {before, test} from "node:test";
import ClassInfo from "./class-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyInfo} from "./type-analyzer.typings.js";

abstract class BaseClassInfoTest {
	public baseProperty!: number;
}

class ChildClassInfoTest extends BaseClassInfoTest {
	public childProperty!: string;
}

export class GrandchildClassInfoTest extends ChildClassInfoTest {
	public grandchildProperty!: boolean;
}

const RegExp = 123;
class ClassInfoTest<T extends string | number> {
	public static text?: string;
	public numeric!: number;
	public union: boolean | undefined;
	public intersection!: null & never;
	public any?: any[];
	public otherArray!: Array<string>;
	public symbol!: (symbol);
	public object!: {a: true, b: false, c: ClassInfoTest<100>};
	public tuple!: [123n, "literal"];
	public createdAt = new Date;
	public indexSignature!: {[something: string]: number};
	public namedTuple!: [first: number, second: string];
	public callback!: () => Promise<void>;
	public usingTypeof!: typeof ClassInfoTest<string>;
	public typeofWithExpression!: typeof RegExp;
	public bigInt = 123n;
	public template!: Required<T>;
	public mapped!: {[K in keyof T]: never};
	public something?: unknown;
	protected hidden?: true;
	private alsoHidden!: true;
}
export {ClassInfoTest as ExportedClassInfoTest};

let classInfo: ClassInfo, baseClassInfo: ClassInfo, childClassInfo: ClassInfo, grandchildClassInfo: ClassInfo;
before(() => {
	TypeAnalyzer.init();
	classInfo = TypeAnalyzer.findByName("ClassInfoTest", ClassInfo);
	baseClassInfo = TypeAnalyzer.findByName("BaseClassInfoTest", ClassInfo);
	childClassInfo = TypeAnalyzer.findByName("ChildClassInfoTest", ClassInfo);
	grandchildClassInfo = TypeAnalyzer.findByName("GrandchildClassInfoTest", ClassInfo);
});

test("properties of classInfo", () => {
	const properties: PropertyInfo[] = [
		{
			name: "text", optional: true, static: true,
			type: {name: "string", fullName: "string", kind: Kind.String, subtypes: []}
		},
		{
			name: "numeric", optional: false, static: false,
			type: {name: "number", fullName: "number", kind: Kind.Number, subtypes: []}
		},
		{
			name: "union", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Union, subtypes: [
				{name: "boolean", fullName: "boolean", kind: Kind.Boolean, subtypes: []},
				{name: "undefined", fullName: "undefined", kind: Kind.Undefined, subtypes: []}
			]}
		},
		{
			name: "intersection", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Intersection, subtypes: [
				{name: "null", fullName: "null", kind: Kind.Null, subtypes: []},
				{name: "never", fullName: "never", kind: Kind.Never, subtypes: []}
			]}
		},
		{
			name: "any", optional: true, static: false,
			type: {name: "", fullName: "", kind: Kind.Array, subtypes: [
				{name: "any", fullName: "any", kind: Kind.Any, subtypes: []}
			]}
		},
		{
			name: "otherArray", optional: false, static: false,
			type: {name: "Array", fullName: "Array", kind: Kind.Array, subtypes: [
				{name: "string", fullName: "string", kind: Kind.String, subtypes: []}
			]}
		},
		{
			name: "symbol", optional: false, static: false,
			type: {name: "symbol", fullName: "symbol", kind: Kind.Symbol, subtypes: []}
		},
		{
			name: "object", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Object, subtypes: [
				{name: "a", fullName: "a", kind: Kind.ObjectProperty, subtypes: [
					{name: "true", fullName: "true", kind: Kind.Boolean, subtypes: []}
				]},
				{name: "b", fullName: "b", kind: Kind.ObjectProperty, subtypes: [
					{name: "false", fullName: "false", kind: Kind.Boolean, subtypes: []}
				]},
				{name: "c", fullName: "c", kind: Kind.ObjectProperty, subtypes: [
					{name: "ClassInfoTest", fullName: classInfo.fullName, kind: Kind.Class, subtypes: [
						{name: "100", fullName: "100", kind: Kind.Number, subtypes: []}
					]}
				]}
			]}
		},
		{
			name: "tuple", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Tuple, subtypes: [
				{name: "123n", fullName: "123n", kind: Kind.BigInt, subtypes: []},
				{name: `"literal"`, fullName: `"literal"`, kind: Kind.String, subtypes: []}
			]}
		},
		{
			name: "createdAt", optional: false, static: false,
			type: {name: "Date", fullName: "Date", kind: Kind.BuiltInClass, subtypes: []}
		},
		{
			name: "indexSignature", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Object, subtypes: [
				{name: "something", fullName: "something", kind: Kind.IndexSignature, subtypes: [
					{name: "string", fullName: "string", kind: Kind.String, subtypes: []},
					{name: "number", fullName: "number", kind: Kind.Number, subtypes: []}
				]}
			]}
		},
		{
			name: "namedTuple", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Tuple, subtypes: [
				{name: "first", fullName: "first", kind: Kind.NamedTupleMember, subtypes: [
					{name: "number", fullName: "number", kind: Kind.Number, subtypes: []}
				]},
				{name: "second", fullName: "second", kind: Kind.NamedTupleMember, subtypes: [
					{name: "string", fullName: "string", kind: Kind.String, subtypes: []},
				]}
			]}
		},
		{
			name: "callback", optional: false, static: false,
			type: {name: "() => Promise<void>", fullName: "() => Promise<void>", kind: Kind.Function, subtypes: []}
		},
		{
			name: "usingTypeof", optional: false, static: false,
			type: {name: "", fullName: "", kind: Kind.Typeof, subtypes: [
				{name: "ClassInfoTest", fullName: classInfo.fullName, kind: Kind.Class, subtypes: [
					{name: "string", fullName: "string", kind: Kind.String, subtypes: []}
				]}
			]}
		},
		{
			name: "typeofWithExpression", optional: false, static: false,
			type: {name: "RegExp", fullName: "RegExp", kind: Kind.Typeof, subtypes: []}
		},
		{
			name: "bigInt", optional: false, static: false,
			type: {name: "bigint", fullName: "bigint", kind: Kind.BigInt, subtypes: []}
		},
		{
			name: "template", optional: false, static: false,
			type: {name: "Required", fullName: "Required", kind: Kind.UtilityType, subtypes: [
				{name: "T", fullName: "T", kind: Kind.TypeParameter, subtypes: []}
			]}
		},
		{
			name: "mapped", optional: false, static: false,
			type: {name: "K", fullName: "K", kind: Kind.MappedType, subtypes: [
				{name: "keyof", fullName: "keyof", kind: Kind.TypeOperator, subtypes: [
					{name: "T", fullName: "T", kind: Kind.TypeParameter, subtypes: []}
				]},
				{name: "never", fullName: "never", kind: Kind.Never, subtypes: []}
			]}
		},
		{
			name: "something", optional: true, static: false,
			type: {name: "unknown", fullName: "unknown", kind: Kind.Unknown, subtypes: []}
		},
	];

	assert.equal(classInfo.name, "ClassInfoTest");
	assert.equal(classInfo.exportName, "ExportedClassInfoTest");
	assert(classInfo.fullName.endsWith(classInfo.exportName));
	assert(classInfo.source.includes("class-info.test.js"));
	assert(classInfo.fullName.includes(classInfo.source));
	assert.equal(classInfo.exported, true);
	assert.equal(classInfo.extends, undefined);
	assert.equal(classInfo.fullExtends, undefined);
	assert.equal(classInfo.abstract, false);
	assert.deepEqual(classInfo.properties, properties);
});

test("equals", () => {
	const type = classInfo.properties.find(property => property.name == "usingTypeof")?.type.subtypes[0];
	assert(type);
	assert.equal(classInfo.equals(type), true);
});

test("properties of baseClassInfo, childClassInfo, grandchildClassInfo", () => {
	assert.equal(baseClassInfo.exportName, "");
	assert.equal(childClassInfo.exportName, "");
	assert.equal(grandchildClassInfo.exportName, "GrandchildClassInfoTest");

	assert.equal(baseClassInfo.exported, false);
	assert.equal(childClassInfo.exported, false);
	assert.equal(grandchildClassInfo.exported, true);

	assert.equal(baseClassInfo.extends, undefined);
	assert.equal(childClassInfo.extends, "BaseClassInfoTest");
	assert.equal(grandchildClassInfo.extends, "ChildClassInfoTest");

	assert.equal(baseClassInfo.fullExtends, undefined);
	assert.equal(childClassInfo.fullExtends, baseClassInfo.fullName);
	assert.equal(grandchildClassInfo.fullExtends, childClassInfo.fullName);

	assert.equal(baseClassInfo.abstract, true);
	assert.equal(childClassInfo.abstract, false);
	assert.equal(grandchildClassInfo.abstract, false);
});

test("isDerivedOf", () => {
	assert.equal(childClassInfo.isDerivedOf(baseClassInfo), true);
	assert.equal(grandchildClassInfo.isDerivedOf(baseClassInfo), true);
	assert.equal(grandchildClassInfo.isDerivedOf(childClassInfo), true);
	assert.equal(baseClassInfo.isDerivedOf(childClassInfo), false);
	assert.equal(baseClassInfo.isDerivedOf(grandchildClassInfo), false);
	assert.equal(childClassInfo.isDerivedOf(grandchildClassInfo), false);
});

test("getAllProperties", () => {
	const properties = [
		{
			name: "grandchildProperty", optional: false, static: false,
			type: {name: "boolean", fullName: "boolean", kind: Kind.Boolean, subtypes: []}
		},
		{
			name: "childProperty", optional: false, static: false,
			type: {name: "string", fullName: "string", kind: Kind.String, subtypes: []}
		},
		{
			name: "baseProperty", optional: false, static: false,
			type: {name: "number", fullName: "number", kind: Kind.Number, subtypes: []}
		},
	];

	assert.deepEqual(grandchildClassInfo.getAllProperties(), properties);
});

test("getParent", () => {
	assert.equal(baseClassInfo.getParent(), undefined);
	assert.equal(childClassInfo.getParent(), baseClassInfo);
	assert.equal(grandchildClassInfo.getParent(), childClassInfo);
});

test("findDerivedClasses", () => {
	assert.deepEqual(baseClassInfo.findDerivedClasses(), [childClassInfo, grandchildClassInfo]);
});