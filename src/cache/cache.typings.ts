export interface CacheOptions {
	/**
	 * If `true`, the cached object is stored as WeakRef.
	 * I.e. it can be automatically deleted from the cache if there are no references to this object anywhere.
	 */
	weak?: boolean;
}