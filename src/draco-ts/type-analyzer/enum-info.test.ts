import EnumInfo from "./enum-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyInfo} from "./type-analyzer.typings.js";

export enum EnumInfoTest {
	First = 0,
	Second = "second",
}

let enumInfo: EnumInfo;
beforeAll(() => {
	TypeAnalyzer.init();
	for (const typeInfo of TypeAnalyzer.getAllTypes()) {
		if (typeInfo instanceof EnumInfo && typeInfo.name == "EnumInfoTest") {
			enumInfo = typeInfo;
		}
	}
});

test("enum properties", () => {
	const properties: PropertyInfo[] = [
		{name: "First", optional: false, static: false, type: {
			name: "0", fullName: "0", kind: Kind.Number, subtypes: []
		}},
		{name: "Second", optional: false, static: false, type: {
			name: `"second"`, fullName: `"second"`, kind: Kind.String, subtypes: []
		}}
	];
	expect(enumInfo.properties).toEqual(properties);
});