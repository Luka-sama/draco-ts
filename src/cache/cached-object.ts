import Cache, {CacheOptions} from "./cache";

export default abstract class CachedObject {
	id!: number | string;
	protected static readonly cacheOptions: CacheOptions = {};

	abstract getName(): string;

	uncache(): void {
		Cache.delete(this.getName());
	}

	protected constructor(...args: any) {
		const derived = this.constructor as any;
		const name = derived.getNameFor(...args);
		const cached = Cache.get(name);
		if (cached) {
			return cached;
		} else {
			Cache.set(name, this, derived.cacheOptions);
		}
	}
}