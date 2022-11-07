import {Embeddable, Property} from "@mikro-orm/core";

/**
 * Vector2 interface
 *
 * You can use it if you need a plain object instead of a class instance.
 */
export interface IVector2 {
	x: number;
	y: number;
}

/** Vector2 class */
@Embeddable()
export class Vector2 {
	@Property()
	readonly x: number = 0;

	@Property()
	readonly y: number = 0;

	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	add(v: Vector2): Vector2 {
		return new Vector2(this.x + v.x, this.y + v.y);
	}

	sub(v: Vector2): Vector2 {
		return new Vector2(this.x - v.x, this.y - v.y);
	}

	mul(v: Vector2 | number): Vector2 {
		if (v instanceof Vector2) {
			return new Vector2(this.x * v.x, this.y * v.y);
		}
		return new Vector2(this.x * v, this.y * v);
	}

	div(v: Vector2 | number): Vector2 {
		if (v instanceof Vector2) {
			return new Vector2(this.x / v.x, this.y / v.y);
		}
		return new Vector2(this.x / v, this.y / v);
	}

	intdiv(v: Vector2 | number): Vector2 {
		v = this.div(v);
		return new Vector2(Math.floor(v.x), Math.floor(v.y));
	}

	equals(v: Vector2): boolean {
		return (this.x == v.x && this.y == v.y);
	}

	toPlain(): IVector2 {
		return {x: this.x, y: this.y};
	}
}

export function Vec2(x?: never, y?: never): Vector2;
export function Vec2(x: IVector2, y?: never): Vector2;
export function Vec2(x: number, y: number): Vector2;

/**
 * Function to create vectors
 *
 * This is the short form instead of constructor using.
 * You can write ```Vec2(1, 1)``` or even ```Vec2(1)``` instead of ```new Vector2(1, 1)```. ```Vec2({x: 1, y: 1})``` is also possible.
 */
export function Vec2(x?: number | IVector2, y?: number): Vector2 {
	if (x === undefined && y === undefined) {
		return new Vector2();
	} else if (typeof x == "object") {
		return new Vector2(x.x, x.y);
	}
	return new Vector2(x, y);
}