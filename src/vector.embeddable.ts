import {Embeddable, Property} from "@mikro-orm/core";

@Embeddable()
export class Vector2 {
	@Property()
	public readonly x: number = 0;

	@Property()
	public readonly y: number = 0;

	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	add(v: Vector2) {
		return new Vector2(this.x + v.x, this.y + v.y);
	}

	sub(v: Vector2) {
		return new Vector2(this.x - v.x, this.y - v.y);
	}

	mul(v: Vector2 | number) {
		if (v instanceof Vector2) {
			return new Vector2(this.x * v.x, this.y * v.y);
		}
		return new Vector2(this.x * v, this.y * v);
	}

	div(v: Vector2 | number) {
		if (v instanceof Vector2) {
			return new Vector2(this.x / v.x, this.y / v.y);
		}
		return new Vector2(this.x / v, this.y / v);
	}

	intdiv(v: Vector2 | number) {
		v = this.div(v);
		return new Vector2(Math.floor(v.x), Math.floor(v.y));
	}

	equals(v: Vector2) {
		return (this.x == v.x && this.y == v.y);
	}

	toPlain() {
		return {x: this.x, y: this.y};
	}
}

export function Vec2(x: number = 0, y: number = 0) {
	return new Vector2(x, y);
}