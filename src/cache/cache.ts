import {CacheOptions} from "./cache.typings";

/**
 * Class for cache management
 *
 * @category Cache
 */
export default class Cache {
	private static entries = {};
	private static started = false;
	private static finalizationRegistry: FinalizationRegistry<any>;

	static init(): void {
		if (Cache.started) {
			return;
		}
		Cache.started = true;
		Cache.finalizationRegistry = new FinalizationRegistry(Cache.delete);
	}

	static has(name: string): boolean {
		return Cache.getParent(name).hasEntry;
	}

	static get(name: string, defaultValue: any = null): any {
		const {hasEntry, entry} = Cache.getParent(name);
		return (hasEntry ? entry : defaultValue);
	}

	static set(name: string, value: any, options: CacheOptions = {}): void {
		const {parent, last} = Cache.getParent(name, true);
		parent[last] = (options.weak ? new WeakRef(value) : value);
		if (options.weak) {
			Cache.finalizationRegistry.register(value, name);
		}
	}

	static delete(name: string): void {
		const {parent, last} = Cache.getParent(name);
		delete parent[last];
	}

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