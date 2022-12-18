import {CacheOptions} from "./cache.typings.js";

/**
 * Class for the cache management
 *
 * This class uses the nested objects to store the entries.
 * For example, zone/location1/2x3 is internally saved as:
 * ```ts
 * Cache.entries = {
 *     "zone": {
 *         "location1": {
 *             "2x3": storedValue
 *         }
 *     }
 * };
 * ```
 * This can be useful to have e.g. statistics on how many of which objects are cached.
 */
export default class Cache {
	private static entries = {};
	private static started = false;
	private static finalizationRegistry: FinalizationRegistry<any>;

	/** Initializes cache */
	static init(): void {
		if (Cache.started) {
			return;
		}
		Cache.started = true;
		Cache.finalizationRegistry = new FinalizationRegistry(Cache.delete);
	}

	/** Returns `true` if cache has an entry with the given name */
	static has(name: string): boolean {
		return Cache.getParent(name).hasEntry;
	}

	/** Returns an entry with the given name if it is saved, otherwise returns defaultValue (by default null) */
	static get(name: string, defaultValue: any = null): any {
		const {hasEntry, entry} = Cache.getParent(name);
		return (hasEntry ? entry : defaultValue);
	}

	/** Sets a value and options for an entry with the given name */
	static set(name: string, value: any, options: CacheOptions = {}): void {
		const {parent, last} = Cache.getParent(name, true);
		parent[last] = (options.weak ? new WeakRef(value) : value);
		if (options.weak) {
			Cache.finalizationRegistry.register(value, name);
		}
	}

	/** Deletes an entry with the given name */
	static delete(name: string): void {
		const {parent, last} = Cache.getParent(name);
		delete parent[last];
	}

	/** Deletes all entries */
	static clear(): void {
		Cache.entries = {};
	}

	/** Returns info for the given name */
	private static getParent(name: string, shouldCreate = false): {
		parent: {
			[key: string]: any
		};
		last: string;
		hasEntry: boolean;
		entry: any;
	} {
		const path = name.split("/");
		let curr: any = Cache.entries, pathPart = "";
		for (let i = 0; i < path.length - 1; i++) {
			pathPart = path[i];
			if (!(pathPart in curr)) {
				if (!shouldCreate) {
					return {parent: {}, last: "", hasEntry: false, entry: null};
				}
				curr[pathPart] = {};
			}
			curr = curr[pathPart];
		}
		pathPart = path[path.length - 1];

		let hasEntry = pathPart in curr;
		let entry = curr[pathPart];
		if (hasEntry && curr[pathPart] instanceof WeakRef) {
			entry = entry.deref();
			if (!entry) {
				delete curr[pathPart];
				hasEntry = false;
			}
		}
		return {parent: curr, last: pathPart, hasEntry, entry};
	}
}