import assert from "assert/strict";
import {ClassDeclaration, SourceFile, SyntaxKind} from "ts-morph";
import {Class} from "../typings.js";
import BaseTypeInfo from "./base-type-info.js";
import SourceInfo from "./source-info.js";
import TypeAnalyzer from "./type-analyzer.js";
import {Kind, PropertyInfo} from "./type-analyzer.typings.js";

/** The arbitrary class with the info about this class */
export type ClassWithInfo = [Class, ClassInfo];

/** A class that contains information about a class */
export default class ClassInfo extends BaseTypeInfo {
	/** If this is a child class, it will contain the name of the parent class that was used in this source file */
	public extends?: string;
	/**
	 * If this is a child class, it will contain the full name of the parent class
	 * (see {@link BaseTypeInfo.fullName})
	 */
	public fullExtends?: string;
	/** Whether the class is abstract or not */
	public abstract: boolean;

	public static getKind() {
		return Kind.Class;
	}

	public static getNodes(source: SourceFile) {
		return source.getClasses();
	}

	public constructor(
		node: ClassDeclaration, sourceInfo: SourceInfo, kindByUrlMap: Map<string, Kind>
	) {
		super(node, sourceInfo, kindByUrlMap);
		this.extends = node.getExtends()?.getChildrenOfKind(SyntaxKind.Identifier)[0]?.getText();
		this.fullExtends = (
			this.extends ? this.getFullNameUsingMapping(this.extends) : undefined
		);
		this.abstract = node.hasModifier(SyntaxKind.AbstractKeyword);

		const typeParameters = node.getTypeParameters().map(typeParameter => typeParameter.getName());
		for (const propertyNode of node.getStaticProperties()) {
			const propertyInfo = this.getPropertyInfo(propertyNode, typeParameters, true);
			if (propertyInfo) {
				this.properties.push(propertyInfo);
			}
		}
		for (const propertyNode of node.getInstanceProperties()) {
			const propertyInfo = this.getPropertyInfo(propertyNode, typeParameters, false);
			if (propertyInfo) {
				this.properties.push(propertyInfo);
			}
		}
	}

	/** Shortcut for {@link TypeAnalyzer.getFromFile} with this class as first argument */
	public getFromFile(name: string) {
		return TypeAnalyzer.getFromFile(this, name);
	}

	/**
	 * Returns whether this class is derived of some base class.
	 * The word "derived" means that it can be a child class, a grandchild class, and so on
	 */
	public isDerivedOf(baseClass: ClassInfo): boolean {
		if (this.fullExtends == baseClass.fullName) {
			return true;
		}
		const parent = this.getParent();
		return (parent ? parent.isDerivedOf(baseClass) : false);
	}

	/** Returns all properties, including the parent properties, the grandparent properties, and so on */
	public getAllProperties(): PropertyInfo[] {
		const parent = this.getParent();
		return (parent ? this.properties.concat(parent.getAllProperties()) : this.properties);
	}

	/** Returns a parent class if it exists */
	public getParent(): ClassInfo | undefined {
		if (this.fullExtends && this.fullExtends != this.extends) {
			const parent = TypeAnalyzer.getByFullName(this.fullExtends);
			assert(parent instanceof ClassInfo, `Class ${this.fullName} extends a non-class type ${this.fullExtends}.`);
			return parent;
		}
		return undefined;
	}

	/**
	 * Returns all derived classes.
	 * The word "derived" means that it can be a child class, a grandchild class, and so on
	 */
	public findDerivedClasses(): ClassInfo[] {
		const result: ClassInfo[] = [];
		for (const typeInfo of TypeAnalyzer.getAllTypes()) {
			if (typeInfo instanceof ClassInfo && typeInfo.isDerivedOf(this)) {
				result.push(typeInfo);
			}
		}
		return result;
	}
}