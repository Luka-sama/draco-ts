import assert from "assert/strict";
import {before, test} from "node:test";
import EnumInfo from "./enum-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyInfo} from "./type-analyzer.typings.js";

export enum EnumInfoTest {
	First = 0,
	Second = "second",
}

before(() => {
	TypeAnalyzer.init();
});

test("enum properties", () => {
	const enumInfo = TypeAnalyzer.findByName("EnumInfoTest", EnumInfo);

	const properties: PropertyInfo[] = [
		{name: "First", optional: false, static: false, type: {
			name: "0", fullName: "0", kind: Kind.Number, subtypes: []
		}},
		{name: "Second", optional: false, static: false, type: {
			name: `"second"`, fullName: `"second"`, kind: Kind.String, subtypes: []
		}}
	];
	assert.deepEqual(enumInfo.properties, properties);
});