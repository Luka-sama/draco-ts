import InterfaceInfo from "./interface-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyInfo} from "./type-analyzer.typings.js";

export interface InterfaceInfoTest {
	one: number;
	two?: string;
}

let interfaceInfo: InterfaceInfo;
beforeAll(() => {
	TypeAnalyzer.init();
	for (const typeInfo of TypeAnalyzer.getAllTypes()) {
		if (typeInfo instanceof InterfaceInfo && typeInfo.name == "InterfaceInfoTest") {
			interfaceInfo = typeInfo;
		}
	}
});

test("interface properties", () => {
	const properties: PropertyInfo[] = [
		{name: "one", optional: false, static: false, type: {
			name: "number", fullName: "number", kind: Kind.Number, subtypes: []
		}},
		{name: "two", optional: true, static: false, type: {
			name: "string", fullName: "string", kind: Kind.String, subtypes: []
		}}
	];
	expect(interfaceInfo.properties).toStrictEqual(properties);
});