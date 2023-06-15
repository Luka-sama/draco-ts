/**
 * Vector2 interface
 *
 * You can use it if you need a plain object instead of a class instance, e.g. to send a vector to user.
 * Normally, however, you do not need this, since the conversion is done automatically (siehe {@link Vector2.toPlain}).
 */
export interface IVector2 {
	x: number;
	y: number;
}

/** Vector2 class. Usually used to represent positions */
export class Vector2 {
	readonly x: number = 0;
	readonly y: number = 0;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	/** Adds a vector to this vector */
	add(v: Vector2): Vector2 {
		return new Vector2(this.x + v.x, this.y + v.y);
	}

	/** Subtracts a vector from this vector */
	sub(v: Vector2): Vector2 {
		return new Vector2(this.x - v.x, this.y - v.y);
	}

	/** Multiplies this vector by a given vector (componentwise) or by a given number */
	mul(v: Vector2 | number): Vector2 {
		if (v instanceof Vector2) {
			return new Vector2(this.x * v.x, this.y * v.y);
		}
		return new Vector2(this.x * v, this.y * v);
	}

	/** Divides this vector by a given vector (componentwise) or by a given number */
	div(v: Vector2 | number): Vector2 {
		if (v instanceof Vector2) {
			return new Vector2(this.x / v.x, this.y / v.y);
		}
		return new Vector2(this.x / v, this.y / v);
	}

	/** Returns the integer quotient of the division of this vector and a given vector (componentwise) or a given number */
	intdiv(v: Vector2 | number): Vector2 {
		v = this.div(v);
		return new Vector2(Math.floor(v.x), Math.floor(v.y));
	}

	/** Returns the negated vector */
	negated(): Vector2 {
		return this.mul(-1);
	}

	/** Returns the vector with Math.sign called for each coordinate */
	sign(): Vector2 {
		return new Vector2(Math.sign(this.x), Math.sign(this.y));
	}

	/** Returns `true` if this vector and a given vector are equal */
	equals(v: Vector2): boolean {
		return (this.x == v.x && this.y == v.y);
	}

	/** Returns squared distance between two vectors */
	distanceSquaredTo(v: Vector2, staggeredMap = true): number {
		const diffX = v.x - this.x;
		const diffY = (v.y - this.y) / (staggeredMap ? 2 : 1);
		return Math.pow(diffX, 2) + Math.pow(diffY, 2);
	}

	/** Returns distance between two vectors */
	distanceTo(v: Vector2, staggeredMap = true): number {
		return Math.sqrt(this.distanceSquaredTo(v, staggeredMap));
	}

	/** Returns this vector with absolute values calculated for each coordinate */
	abs(): Vector2 {
		return new Vector2(Math.abs(this.x), Math.abs(this.y));
	}

	/** Returns this vector with the Y coordinate multiplied by 2 (adapted for staggered maps) */
	toStaggered() {
		return new Vector2(this.x, this.y * 2);
	}

	/** Converts this vector to a plain object. Used by {@link WS.prepare | WS.prepare} to prepare data before sending to the user */
	toPlain(): IVector2 {
		return {x: this.x, y: this.y};
	}

	/** Returns `true` if the given array contains this vector */
	isElementOf(vectors: Vector2[]): boolean {
		return vectors.some(vector => this.equals(vector));
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