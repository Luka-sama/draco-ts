import {wrap, WrappedEntity} from "@mikro-orm/core";
import _ from "lodash";
import {EM} from "../orm";
import Cache from "./cache";
import {CacheOptions} from "./cache.typings";

/**
 * Internal interface
 *
 * It is exported to avoid TypeDoc warning (referenced, but not included in the documentation).
 * It is used in the return type: T extends ICachedEntity.
 * This means that the function returns class instance of some class that is child of CachedEntity.
 *
 * @category Cache
 */
export interface ICachedEntity {
	new(...args: any): CachedEntity
}

/**
 * Cached entity
 *
 * Do not use "fields" option on cached entities.
 * Use query builder with execute at the end if you want to select only a few fields.
 * @category Cache
 */
export abstract class CachedEntity {
	id!: number;
	protected static readonly cacheOptions: CacheOptions = {};
	private cached?: any;
	private removed?: boolean;

	static async get<T extends ICachedEntity>(this: T, id: number): Promise<InstanceType<T> | null> {
		if (!id) {
			return null;
		}
		const cached = (this as any).getIfCached(id);
		return cached || (await EM.findOne(this, {id})) as InstanceType<T>;
	}

	static async getOrFail<T extends ICachedEntity>(this: T, id: number): Promise<InstanceType<T>> {
		const cached = (this as any).getIfCached(id);
		return cached || (await EM.findOneOrFail(this, {id})) as InstanceType<T>;
	}

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

	getName(): string {
		return (this.constructor as any).getNameFor(this.id);
	}

	/** Returns true if entity is not yet created **/
	isNotYetCreated(): boolean {
		return !this.id;
	}

	/** Returns true if entity was fully loaded from DB **/
	isInitialized(): boolean {
		return wrap(this).isInitialized();
	}

	/** Returns true if entity is saved in DB **/
	isSaved(): boolean {
		return !this.isNotYetCreated() && !this.isRemoved();
	}

	/** Returns true if entity was removed from DB **/
	isRemoved(): boolean {
		return !!this.removed;
	}

	/** Returns true if entity is saved in DB and initialized (was fully loaded from DB) **/
	isActive(): boolean {
		return this.isInitialized() && this.isSaved();
	}

	cache(): void {
		if (this.id) {
			const derived = this.constructor as any;
			const name = derived.getNameFor(this.id);
			Cache.set(name, this, derived.cacheOptions);
		}
	}

	uncache(): void {
		if (this.id) {
			const derived = this.constructor as any;
			const name = derived.getNameFor(this.id);
			Cache.delete(name);
		}
	}

	async create(): Promise<void> {
		await EM.persistAndFlush(this);
		this.cache();
	}

	async remove(): Promise<void> {
		this.removed = true;
		await EM.removeAndFlush(this);
		this.uncache();
	}

	// Should be public and not protected because TypeScript behaves strange if it is protected (e.g. in "sck.user = user;")
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

		return cached;
	}

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

	private static getNameFor(id: number): string {
		return _.camelCase(this.name) + `/${id}`;
	}
}

/**
 * Weak cached entity
 *
 * @category Cache
 */
export abstract class WeakCachedEntity extends CachedEntity {
	protected static readonly cacheOptions: CacheOptions = {weak: true};
}