export interface CacheOptions {
	/**
	 * If `true`, the cached object is stored as WeakRef.
	 * I.e. it can be automatically deleted from the cache if there are no references to this object anywhere.
	 */
	weak?: boolean;

	/**
	 * How long the value is stored in the cache after the last read or update (in ms).
	 * If `weak` is set to `true`, this property has no effect
	 * (the value is deleted sometime if there are no references to this object and not in `duration` ms).
	 * See also {@link Const.CACHE_DEFAULT_DURATION_MS}.
	 */
	duration?: number;
}