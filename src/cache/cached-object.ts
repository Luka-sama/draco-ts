import Cache from "./cache";
import {CacheOptions} from "./cache.typings";

export default abstract class CachedObject {
	id!: number | string;
	protected static readonly cacheOptions: CacheOptions = {};
	private cached?: any;

	abstract getName(): string;

	uncache(): void {
		Cache.delete(this.getName());
	}

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

	protected getInstance(): this {
		const cached = this.cached;
		if (!cached) {
			return this;
		}
		delete this.cached;
		return cached;
	}
}