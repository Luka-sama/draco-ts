import {Embeddable, Property} from "@mikro-orm/core";

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
@Embeddable()
export class Vector2 {
	@Property()
	readonly x: number = 0;

	@Property()
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

	/** Returns `true` if this vector and a given vector are equal */
	equals(v: Vector2): boolean {
		return (this.x == v.x && this.y == v.y);
	}

	/** Converts this vector to a plain object. Used by {@link WS.prepare | WS.prepare} to prepare data before sending to the user */
	toPlain(): IVector2 {
		return {x: this.x, y: this.y};
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
		return new Vector2(x.x, x.y);
	} else if (x !== undefined && y === undefined) {
		return new Vector2(x, x);
	}
	return new Vector2(x || 0, y || 0);
}