import assert from "assert/strict";

/**
 * Vector2 interface
 *
 * You can use it if you need a plain object instead of a class instance, e.g. to send a vector to the user.
 * Normally, however, you do not need this, since the conversion is done automatically.
 */
export interface IVector2 {
	x: number;
	y: number;
}

/**
 * Vector3 interface
 *
 * You can use it if you need a plain object instead of a class instance, e.g. to send a vector to the user.
 * Normally, however, you do not need this, since the conversion is done automatically.
 */
export interface IVector3 {
	x: number;
	y: number;
	z: number;
}

/** Abstract basic class that can represent a vector with arbitrary number of components */
export abstract class Vector {
	private readonly components: number[];

	protected constructor(...components: number[]) {
		this.components = components;
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

	/** Returns `true` if this vector and a given vector are equal */
	public equals<T extends Vector>(this: T, v: T): boolean {
		assert(this.components.length == v.components.length);
		return this.components.every((component, index) => {
			return Math.abs(component - v.components[index]) < 1e-5;
		});
	}

	/** Returns `true` if the given array contains this vector */
	public isElementOf<T extends Vector>(this: T, vectors: T[]): boolean {
		return vectors.some(vector => this.equals(vector));
	}

	/** Returns squared distance between two vectors. If `staggeredMap` is true, divides the distance in Y-component by 2 */
	public distanceSquaredTo<T extends Vector>(this: T, v: T, staggeredMap = false): number {
		assert(this.components.length == v.components.length);
		return this.components.reduce((accumulator, component, index) => {
			return accumulator + ((component - v.components[index]) / (index == 1 && staggeredMap ? 2 : 1)) ** 2;
		}, 0);
	}

	/** Returns distance between two vectors. If `staggeredMap` is true, divides the distance in Y-component by 2 */
	public distanceTo<T extends Vector>(this: T, v: T, staggeredMap = false): number {
		return Math.sqrt(this.distanceSquaredTo(v, staggeredMap));
	}

	/** Returns this vector with the Y coordinate multiplied by 2 (adapted for staggered maps) */
	public toStaggered<T extends Vector>(this: T): T {
		return this.new(this.components.map((component, index) => {
			return (index == 1 ? component * 2 : component);
		}));
	}

	/** Applies the given function to all components of this vector */
	private applyTo1<T extends Vector>(this: T, func: (a: number) => number): T {
		return this.new(this.components.map(component => {
			return func(component);
		}));
	}

	/** Applies the given function to all components of this vector and the given vector */
	private applyTo2<T extends Vector>(this: T, v: T, func: (a: number, b: number) => number): T {
		assert(this.components.length == v.components.length);
		return this.new(this.components.map((component, index) => {
			return func(component, v.components[index]);
		}));
	}

	/** Creates a new vector using the child constructor */
	private new<T extends Vector>(this: T, components: number[]): T {
		assert(this.components.length == components.length);
		return new (this.constructor as any)(...components);
	}
}

/** Vector2 class. Usually used to represent positions */
export class Vector2 extends Vector {
	/** Creates a vector with the given coordinates */
	public constructor(public readonly x: number, public readonly y: number) {
		super(x, y);
	}

	/** Converts this vector to a plain object */
	public toPlain(): IVector2 {
		return {x: this.x, y: this.y};
	}

	/** Converts to Vector3 with the given Z component */
	public toVector3(z = 0): Vector3 {
		return new Vector3(this.x, this.y, z);
	}
}

/** Vector3 class */
export class Vector3 extends Vector {
	/** Creates a vector with the given coordinates */
	public constructor(public readonly x: number, public readonly y: number, public readonly z: number) {
		super(x, y, z);
	}

	/** Converts this vector to a plain object */
	public toPlain(): IVector3 {
		return {x: this.x, y: this.y, z: this.z};
	}

	/** Converts to Vector2 losing Z component */
	public toVector2(): Vector2 {
		return new Vector2(this.x, this.y);
	}
}

export function Vec2(x?: never, y?: never): Vector2;
export function Vec2(x: IVector2, y?: never): Vector2;
export function Vec2(x: number, y?: never): Vector2;
export function Vec2(x: number, y: number): Vector2;

/**
 * Function to create vectors
 *
 * This is the short form instead of constructor using.
 * You can write `Vec2(1, 1)` or even `Vec2(1)` instead of `new Vector2(1, 1)`. `Vec2({x: 1, y: 1})` is also possible.
 */
export function Vec2(x?: number | IVector2, y?: number): Vector2 {
	if (typeof x == "object") {
		return Vec2(x.x, x.y);
	} else if (typeof x == "number" && !isNaN(x) && y === undefined) {
		return new Vector2(x, x);
	} else if (x === undefined && y === undefined) {
		return new Vector2(0, 0);
	} else if (typeof x == "number" && typeof y == "number" && !isNaN(x) && !isNaN(y)) {
		return new Vector2(x, y);
	}
	throw new Error(`Incorrect arguments for Vec2: x=${x} (typeof x=${typeof x}), y=${y} (typeof y=${typeof y}).`);
}

export function Vec3(x?: never, y?: never, z?: never): Vector3;
export function Vec3(x: IVector3, y?: never, z?: never): Vector3;
export function Vec3(x: number, y?: never, z?: never): Vector3;
export function Vec3(x: number, y: number, z: number): Vector3;

/**
 * Function to create vectors
 *
 * This is the short form instead of constructor using.
 * You can write `Vec3(1, 1, 1)` or even `Vec3(1)` instead of `new Vector3(1, 1, 1)`. `Vec3({x: 1, y: 1, z: 1})` is also possible.
 */
export function Vec3(x?: number | IVector3, y?: number, z?: number): Vector3 {
	if (typeof x == "object") {
		return Vec3(x.x, x.y, x.z);
	} else if (typeof x == "number" && !isNaN(x) && y === undefined && z === undefined) {
		return new Vector3(x, x, x);
	} else if (x === undefined && y === undefined && z === undefined) {
		return new Vector3(0, 0, 0);
	} else if (typeof x == "number" && typeof y == "number" && typeof z == "number" && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
		return new Vector3(x, y, z);
	}
	throw new Error(
		`Incorrect arguments for Vec3: x=${x} (typeof x=${typeof x}), y=${y} (typeof y=${typeof y}), z=${z} (typeof z=${typeof z}).`
	);
}