import {Exact} from "../typings.js";
import TypeAliasInfo from "./type-alias-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyType} from "./type-analyzer.typings.js";

export type SomeType<T, O extends Exact<{a: number}, O>> = T;
export type TypeAliasInfoTest = SomeType<number, {a: 123}>;

let someTypeInfo: TypeAliasInfo, typeAliasInfo: TypeAliasInfo;
beforeAll(() => {
	TypeAnalyzer.init();
	for (const typeInfo of TypeAnalyzer.getAllTypes()) {
		if (!(typeInfo instanceof TypeAliasInfo)) {
			continue;
		}
		if (typeInfo.name == "SomeType") {
			someTypeInfo = typeInfo;
		} else if (typeInfo.name == "TypeAliasInfoTest") {
			typeAliasInfo = typeInfo;
		}
	}
});

test("type alias type", () => {
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
	expect(typeAliasInfo.properties[0].type).toStrictEqual(type);
});