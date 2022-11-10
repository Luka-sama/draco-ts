import {EventArgs, EventSubscriber, Subscriber, wrap, WrappedEntity} from "@mikro-orm/core";
import _ from "lodash";
import {EM} from "../core/orm";
import Cache from "./cache";
import {CacheOptions} from "./cache.typings";

/**
 * Internal interface
 *
 * It is exported to avoid TypeDoc warning (referenced, but not included in the documentation).
 * It is used in the return type: T extends ICachedEntity.
 * This means that the function returns class instance of some class that is child of CachedEntity.
 */
export interface ICachedEntity {
	new(...args: any): CachedEntity
}

/**
 * Cached MikroORM-entity
 *
 * If a class derives CachedEntity or WeakCachedEntity, it will be ensured that there is only one instance of this class for each ID,
 * see example:
 * ```ts
 * const user = await User.getOrFail(1);
 * const acc1 = user.account;
 * const acc2 = await EM.findOne(Account, {id: acc1.id});
 * console.log(acc1 == acc2); // true
 * ```
 *
 * This class is intended for the entities that will be stored in the DB. If this is not the case, use {@link CachedObject}.
 *
 * To use this, the constructor must be modified as follows, see also example below:
 * - The last argument must be id with default value 0.
 * - ```super(id);``` must be the first line of the constructor.
 * - ```return this.getInstance();``` must be the last line of the constructor.
 *
 * ```ts
 * constructor(name: string, account: Account, location: Location, position: Vector2, id = 0) {
 *  super(id);
 *  this.name = name;
 *  this.account = account;
 *  this.location = location;
 *  this.position = position;
 *  return this.getInstance();
 * }
 * ```
 *
 * **IMPORTANT!** Do not use option "fields" (select only some fields) on cached entities, as it results in broken entities.
 * Use query builder with "execute" at the end if you really need to select only a few fields
 * (so you will get plain objects instead of entities).
 */
export abstract class CachedEntity {
	id!: number;
	protected static readonly cacheOptions: CacheOptions = {};
	private cached?: any;
	private removed?: boolean;
	private initialized?: boolean;
	private touched?: boolean;

	/** Gets the entity by ID either from the cache or from the DB */
	static async get<T extends ICachedEntity>(this: T, id: number): Promise<InstanceType<T> | null> {
		if (!id) {
			return null;
		}
		const cached = (this as any).getIfCached(id);
		return cached || (await EM.findOne(this, {id})) as InstanceType<T>;
	}

	/** Gets the entity by ID either from the cache or from the DB. If the entity is not found, throws an exception */
	static async getOrFail<T extends ICachedEntity>(this: T, id: number): Promise<InstanceType<T>> {
		const cached = (this as any).getIfCached(id);
		return cached || (await EM.findOneOrFail(this, {id})) as InstanceType<T>;
	}

	/** Gets the entity by ID from the cache. If the entity is not cached, returns null */
	static getIfCached<T extends ICachedEntity>(this: T, id: number): InstanceType<T> | null {
		if (!id) {
			return null;
		}
		const name = (this as any).getNameFor(id);

		const cached = Cache.get(name);
		if (cached && cached.isInitialized()) {
			EM.persist(cached);
			return cached;
		}

		return null;
	}

	/** Returns the name that will be used to identify the entity in the cache */
	getName(): string {
		return (this.constructor as any).getNameFor(this.id);
	}

	/** Returns ```true``` if entity is not yet created **/
	isNotYetCreated(): boolean {
		return !this.id;
	}

	/** Returns ```true``` if entity was fully loaded from DB **/
	isInitialized(): boolean {
		return wrap(this).isInitialized();
	}

	/** Returns ```true``` if entity is saved in DB **/
	isSaved(): boolean {
		return !this.isNotYetCreated() && !this.isRemoved();
	}

	/** Returns ```true``` if entity was removed from DB **/
	isRemoved(): boolean {
		return !!this.removed;
	}

	/** Returns ```true``` if entity is saved in DB and initialized (was fully loaded from DB) **/
	isActive(): boolean {
		return this.isInitialized() && this.isSaved();
	}

	/** Caches the entity (if it has ID, i.e. it is saved in DB) */
	cache(): void {
		if (this.id) {
			const derived = this.constructor as any;
			const name = derived.getNameFor(this.id);
			Cache.set(name, this, derived.cacheOptions);
		}
	}

	/** Removes the entity from cache if it is cached */
	uncache(): void {
		if (this.id) {
			const derived = this.constructor as any;
			const name = derived.getNameFor(this.id);
			Cache.delete(name);
		}
	}

	/** Creates the entity in the DB and caches this entity */
	async create(): Promise<void> {
		await EM.persistAndFlush(this);
		this.cache();
	}

	/** Removes the entity from the DB and the cache */
	async remove(): Promise<void> {
		this.removed = true;
		await EM.removeAndFlush(this);
		this.uncache();
	}

	/**
	 * Returns the entity instance that should be used.
	 * The result of this method must be returned from the constructor of the derived class.
	 *
	 * If the entity is not cached, it simply returns ```this```.
	 * If it is cached, returns the cached instance instead.
	 * If a reference (e.g. user.account) is not loaded in the cached instance, but is loaded in this,
	 * replaces the reference with the loaded one.
	 * Also, flags "initialized" and "touched" are saved to restore them later in {@link setInternalProps}.
	 *
	 * Should be public and not protected because TypeScript behaves strange if it is protected (e.g. in ```sck.user = user;```).
	 */
	getInstance(): this {
		const cached = this.cached;
		if (!cached) {
			return this;
		}
		delete this.cached;

		for (const property in this) {
			const wrapped: any = wrap(this[property]);
			if (wrapped instanceof WrappedEntity &&
				(this[property] as any).id == cached[property].id &&
				!wrap(cached[property]).isInitialized()) {
				cached[property] = this[property];
			}
		}

		const wrapped = wrap(cached);
		cached.initialized = wrapped.isInitialized();
		cached.touched = wrapped.isTouched();
		return cached;
	}

	/** Restores the flags (initialized and touched) after MikroORM resets them */
	setInternalProps(): void {
		if (this.initialized !== undefined) {
			(this as any).__helper.__initialized = this.initialized;
			delete this.initialized;
		}
		if (this.touched !== undefined) {
			(this as any).__helper.__touched = this.touched;
			delete this.touched;
		}
	}

	/**
	 * Superclass constructor
	 *
	 * Here are three possible cases:
	 * - The entity is not cached. In this case it will be cached.
	 * - The entity is cached, but not loaded. In this case the cached entity
	 * is returned and updated by the constructor of the derived class.
	 * - The entity is cached and loaded. In this case the cached entity is saved in this.cached
	 * and must be returned in the constructor of the derived class with {@link getInstance}.
	 * This approach is necessary to avoid the resetting properties to their default values.
	 */
	protected constructor(id: number) {
		if (id == 0) {
			return;
		}
		this.id = id;

		const derived = this.constructor as any;
		const name = derived.getNameFor(id);
		const cached = Cache.get(name);
		if (cached && !cached.isInitialized()) {
			return cached;
		} else if (cached) {
			this.cached = cached;
		} else {
			this.cache();
		}
	}

	/** Returns the name for the given ID that will be used to identify the entity in the cache */
	private static getNameFor(id: number): string {
		return _.camelCase(this.name) + `/${id}`;
	}
}

/** The cached entity class with weak=true in options (see {@link CachedEntity} and {@link CacheOptions} for details) */
export abstract class WeakCachedEntity extends CachedEntity {
	protected static readonly cacheOptions: CacheOptions = {weak: true};
}

@Subscriber()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CachedEntitySubscriber implements EventSubscriber {
	// eslint-disable-next-line class-methods-use-this
	onInit<T>({entity}: EventArgs<T>): void {
		if (entity instanceof CachedEntity) {
			entity.setInternalProps();
		}
	}
}