import assert from "assert/strict";
import _ from "lodash";
import {Float, Int32} from "../core/typings.js";

/** Abstract basic class that can represent a vector with arbitrary number of components */
export abstract class Vector {
	// The symbol # (instead of TypeScript keyword "private") is used to hide this field when serializing a vector
	readonly #components: number[];

	protected constructor(...components: number[]) {
		assert(!components.some(component => isNaN(component)));
		this.#components = components;
	}

	/** Adds a vector to this vector */
	public add<T extends Vector>(this: T, v: T): T {
		return this.applyTo2(v, (a, b) => a + b);
	}

	/** Subtracts a vector from this vector */
	public sub<T extends Vector>(this: T, v: T): T {
		return this.applyTo2(v, (a, b) => a - b);
	}

	/** Multiplies this vector by a given vector (componentwise) or by a given number */
	public mul<T extends Vector>(this: T, v: T | number): T {
		if (v instanceof Vector) {
			return this.applyTo2(v, (a, b) => a * b);
		}
		return this.applyTo1(a => a * v);
	}

	/** Divides this vector by a given vector (componentwise) or by a given number */
	public div<T extends Vector>(this: T, v: T | number): T {
		if (v instanceof Vector) {
			return this.applyTo2(v, (a, b) => a / b);
		}
		return this.applyTo1(a => a / v);
	}

	/** Returns the integer quotient of the division of this vector and a given vector (componentwise) or a given number */
	public intdiv<T extends Vector>(this: T, v: T | number): T {
		return this.div(v).applyTo1(Math.floor);
	}

	/** Returns the negated vector */
	public negated<T extends Vector>(this: T): T {
		return this.applyTo1(a => -a);
	}

	/** Returns the vector with Math.sign called for each coordinate */
	public sign<T extends Vector>(this: T): T {
		return this.applyTo1(Math.sign);
	}

	/** Returns this vector with absolute values calculated for each coordinate */
	public abs<T extends Vector>(this: T): T {
		return this.applyTo1(Math.abs);
	}

	/** Returns `true` if the components of this vector are integers (i.e. numbers without fractal part) */
	public isInt<T extends Vector>(this: T): boolean {
		return this.#components.every(Number.isInteger);
	}

	/** Returns `true` if this vector and a given vector are equal */
	public equals<T extends Vector>(this: T, v: T): boolean {
		return this.sub(v).#components.every(component => Math.abs(component) < 1e-5);
	}

	/** Returns `true` if the given array contains this vector */
	public isElementOf<T extends Vector>(this: T, vectors: T[]): boolean {
		return vectors.some(vector => this.equals(vector));
	}

	/** Returns squared length of this vector. If `staggeredMap` is true, divides the Y-component by 2 before calculating the length */
	public lengthSquared<T extends Vector>(this: T, staggeredMap = false): number {
		return this.#components.reduce((accumulator, component, index) => {
			return accumulator + (component / (index == 1 && staggeredMap ? 2 : 1)) ** 2;
		}, 0);
	}

	/** Returns length of this vector. If `staggeredMap` is true, divides the Y-component by 2 before calculating the length */
	public length<T extends Vector>(this: T, staggeredMap = false): number {
		return Math.sqrt(this.lengthSquared(staggeredMap));
	}

	/** Returns squared distance between two vectors. If `staggeredMap` is true, divides the distance in Y-component by 2 */
	public distanceSquaredTo<T extends Vector>(this: T, v: T, staggeredMap = false): number {
		return this.sub(v).lengthSquared(staggeredMap);
	}

	/** Returns distance between two vectors. If `staggeredMap` is true, divides the distance in Y-component by 2 */
	public distanceTo<T extends Vector>(this: T, v: T, staggeredMap = false): number {
		return this.sub(v).length(staggeredMap);
	}

	/** Returns this vector with the Y coordinate multiplied by 2 (adapted for staggered maps) */
	public toStaggered<T extends Vector>(this: T): T {
		return this.new(this.#components.map((component, index) => {
			return (index == 1 ? component * 2 : component);
		}));
	}

	/** Returns the components of this vector as a string, e.g. "(1, 2, 3)" */
	public toString<T extends Vector>(this: T): string {
		const components = this.#components.map(component => _.round(component, 5));
		return `(${components.join(", ")})`;
	}

	/** Applies the given function to all components of this vector */
	private applyTo1<T extends Vector>(this: T, func: (a: number) => number): T {
		return this.new(this.#components.map(component => {
			return func(component);
		}));
	}

	/** Applies the given function to all components of this vector and the given vector */
	private applyTo2<T extends Vector>(this: T, v: T, func: (a: number, b: number) => number): T {
		assert(this.#components.length == v.#components.length);
		return this.new(this.#components.map((component, index) => {
			return func(component, v.#components[index]);
		}));
	}

	/** Creates a new vector using the child constructor */
	private new<T extends Vector>(this: T, components: number[]): T {
		assert(this.#components.length == components.length);
		return new (this.constructor as any)(...components);
	}
}

/** Vector2f class (with Float components). Usually used to represent positions */
export class Vector2f extends Vector {
	public static readonly Zero = new Vector2f(0, 0);
	public static readonly One = new Vector2f(1, 1);

	/** Creates a vector with the given coordinates */
	public constructor(public readonly x: Float, public readonly y: Float) {
		super(x, y);
	}

	/** Converts to Vector2i with rounding */
	public toVector2i(): Vector2i {
		return new Vector2i(Math.round(this.x), Math.round(this.y));
	}

	/** Converts to Vector3f using the given Z component */
	public toVector3f(z: Float = 0): Vector3f {
		return new Vector3f(this.x, this.y, z);
	}

	/** Converts to Vector3i using the given Z component and with rounding */
	public toVector3i(z: Int32 = 0): Vector3i {
		return new Vector3i(Math.round(this.x), Math.round(this.y), Math.round(z));
	}
}

/** Vector2i class (with Int32 components). Usually used to represent positions */
export class Vector2i extends Vector {
	public static readonly Zero = new Vector2i(0, 0);
	public static readonly One = new Vector2i(1, 1);

	/** Creates a vector with the given coordinates */
	public constructor(public readonly x: Int32, public readonly y: Int32) {
		assert(Number.isInteger(x) && Number.isInteger(y));
		super(x, y);
	}

	/** Converts to Vector2f */
	public toVector2f(): Vector2f {
		return new Vector2f(this.x, this.y);
	}

	/** Converts to Vector3f with the given Z component */
	public toVector3f(z: Float = 0): Vector3f {
		return new Vector3f(this.x, this.y, z);
	}

	/** Converts to Vector3i with the given Z component */
	public toVector3i(z: Int32 = 0): Vector3i {
		return new Vector3i(this.x, this.y, z);
	}
}

/** Vector3f class (with Float components) */
export class Vector3f extends Vector {
	public static readonly Zero = new Vector3f(0, 0, 0);
	public static readonly One = new Vector3f(1, 1, 1);

	/** Creates a vector with the given coordinates */
	public constructor(public readonly x: Float, public readonly y: Float, public readonly z: Float) {
		super(x, y, z);
	}

	/** Converts to Vector2 losing Z component */
	public toVector2f(): Vector2f {
		return new Vector2f(this.x, this.y);
	}

	/** Converts to Vector2i with rounding losing Z component */
	public toVector2i(): Vector2i {
		return new Vector2i(Math.round(this.x), Math.round(this.y));
	}

	/** Converts to Vector3i with rounding */
	public toVector3i(): Vector3i {
		return new Vector3i(Math.round(this.x), Math.round(this.y), Math.round(this.z));
	}
}

/** Vector3i class (with Int32 components) */
export class Vector3i extends Vector {
	public static readonly Zero = new Vector3i(0, 0, 0);
	public static readonly One = new Vector3i(1, 1, 1);

	/** Creates a vector with the given coordinates */
	public constructor(public readonly x: Int32, public readonly y: Int32, public readonly z: Int32) {
		assert(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z));
		super(x, y, z);
	}

	/** Converts to Vector2f losing Z component */
	public toVector2f(): Vector2f {
		return new Vector2f(this.x, this.y);
	}

	/** Converts to Vector2i losing Z component */
	public toVector2i(): Vector2i {
		return new Vector2i(this.x, this.y);
	}

	/** Converts to Vector3f */
	public toVector3f(): Vector3f {
		return new Vector3f(this.x, this.y, this.z);
	}
}

/**
 * Creates a vector.
 * This is the short form instead of constructor using.
 * You can write `Vec2f(1, 1.5)` instead of `new Vector2f(1, 1.5)`.
 */
export function Vec2f(x: Float, y: Float): Vector2f {
	return new Vector2f(x, y);
}

/**
 * Creates a vector.
 * This is the short form instead of constructor using.
 * You can write `Vec2i(1, 2)` instead of `new Vector2i(1, 2)`.
 */
export function Vec2i(x: Int32, y: Int32): Vector2i {
	return new Vector2i(x, y);
}

/**
 * Creates a vector.
 * This is the short form instead of constructor using.
 * You can write `Vec3f(1, 1.5, 2)` instead of `new Vector3f(1, 1.5, 2)`.
 */
export function Vec3f(x: Float, y: Float, z: Float): Vector3f {
	return new Vector3f(x, y, z);
}

/**
 * Creates a vector.
 * This is the short form instead of constructor using.
 * You can write `Vec3i(1, 2, 3)` instead of `new Vector3i(1, 2, 3)`.
 */
export function Vec3i(x: Int32, y: Int32, z: Int32): Vector3i {
	return new Vector3i(x, y, z);
}