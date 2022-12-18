import Cache from "./cache.js";
import {CacheOptions} from "./cache.typings.js";

/**
 * If a class derives CachedObject, it will be ensured that there is only one instance of this class for each name,
 * see example:
 * ```ts
 * const location = EM.getReference(Location, 1);
 * const position = Vec2(1, 1);
 * const zone1 = new Zone(location, position);
 * const zone2 = new Zone(location, position);
 * console.log(zone1 == zone2); // true
 * ```
 *
 * For entities (objects that should be stored in the DB), use {@link CachedEntity} or {@link WeakCachedEntity}.
 *
 * To use this, the code must be modified as follows, see also example below:
 * - The static method getNameFor must be implemented. It returns a unique name that is used to identify identical objects.
 * - The non-static method getName must be implemented and use static method getNameFor.
 * - In the constructor, "super" must be called with the arguments that will be passed to getNameFor.
 * - `return this.getInstance();` must be the last line of the constructor.
 *
 * ```ts
 * export default class Zone extends CachedObject {
 *  private readonly location: Location;
 *  private readonly zonePosition: Vector2;
 *
 *  static getNameFor(location: Location, zonePosition: Vector2): string {
 *      return `zone/location${location.id}/${zonePosition.x}x${zonePosition.y}`;
 *  }
 *
 *  constructor(location: Location, zonePosition: Vector2) {
 *      super(location, zonePosition);
 *      this.location = location;
 *      this.zonePosition = zonePosition;
 *      return this.getInstance();
 *  }
 *
 *  getName(): string {
 *      return Zone.getNameFor(this.location, this.zonePosition);
 *  }
 * }
 * ```
 */
export default abstract class CachedObject {
	id!: number | string;
	protected static readonly cacheOptions: CacheOptions = {};
	private cached?: any;

	/** Returns a unique name that is used to identify identical objects */
	abstract getName(): string;

	/** Removes this object from the cache */
	uncache(): void {
		Cache.delete(this.getName());
	}

	/**
	 * Superclass constructor
	 *
	 * If the object is cached, it is saved in this.cached. The cached object will be then returned with {@link getInstance}.
	 * If the object is not cached, it will be cached.
	 */
	protected constructor(...args: any) {
		const derived = this.constructor as any;
		const name = derived.getNameFor(...args);
		const cached = Cache.get(name);
		if (cached) {
			this.cached = cached;
		} else {
			Cache.set(name, this, derived.cacheOptions);
		}
	}

	/**
	 * Returns the object instance that should be used.
	 * The result of this method must be returned from the constructor of the derived class.
	 *
	 * If the entity is not cached, it simply returns `this`.
	 * If it is cached, returns the cached instance instead.
	 */
	protected getInstance(): this {
		const cached = this.cached;
		if (!cached) {
			return this;
		}
		delete this.cached;
		return cached;
	}
}

/** The cached object class with weak=true in options (see {@link CachedObject} and {@link CacheOptions} for details) */
export abstract class WeakCachedObject extends CachedObject {
	protected static readonly cacheOptions: CacheOptions = {weak: true};
}