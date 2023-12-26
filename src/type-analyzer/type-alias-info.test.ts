import assert from "assert/strict";
import {before, test} from "node:test";
import path from "path";
import {Exact} from "../typings.js";
import TypeAliasInfo from "./type-alias-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyType} from "./type-analyzer.typings.js";

export type SomeType<T, O extends Exact<{a: number}, O>> = T;
export type TypeAliasInfoTest = SomeType<number, {a: 123}>;

before(() => {
	const fileName = path.basename(import.meta.url).replace(".js", ".d.ts");
	TypeAnalyzer.init(["**/" + fileName]);
});

test("type alias type", () => {
	const someTypeInfo = TypeAnalyzer.findByName("SomeType", TypeAliasInfo);
	const typeAliasInfo = TypeAnalyzer.findByName("TypeAliasInfoTest", TypeAliasInfo);

	const type: PropertyType = {
		name: "SomeType", fullName: someTypeInfo.fullName, kind: Kind.TypeAlias, subtypes: [
			{name: "number", fullName: "number", kind: Kind.Number, subtypes: []},
			{name: "", fullName: "", kind: Kind.Object, subtypes: [
				{name: "a", fullName: "a", kind: Kind.ObjectProperty, subtypes: [
					{name: "123", fullName: "123", kind: Kind.Number, subtypes: []}
				]}
			]}
		]
	};
	assert.deepEqual(typeAliasInfo.properties[0].type, type);
});