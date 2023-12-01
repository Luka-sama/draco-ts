import assert from "assert/strict";
import {before, test} from "node:test";
import InterfaceInfo from "./interface-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyInfo} from "./type-analyzer.typings.js";

export interface InterfaceInfoTest {
	one: number;
	two?: string;
}

before(() => {
	TypeAnalyzer.init();
});

test("interface properties", () => {
	const interfaceInfo = TypeAnalyzer.findByName("InterfaceInfoTest", InterfaceInfo);

	const properties: PropertyInfo[] = [
		{name: "one", optional: false, static: false, type: {
			name: "number", fullName: "number", kind: Kind.Number, subtypes: []
		}},
		{name: "two", optional: true, static: false, type: {
			name: "string", fullName: "string", kind: Kind.String, subtypes: []
		}}
	];
	assert.deepEqual(interfaceInfo.properties, properties);
});