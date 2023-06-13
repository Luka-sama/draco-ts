import Const from "../util/const.js";
import {CacheOptions} from "./cache.typings.js";

interface Entry {
	value: any;
	options: CacheOptions;
	lastAccess: number;
}
/**
 * This is used by the private method searchFor as the return type.
 * @internal
 */
export interface SearchInfo {
	parent: Map<string, Subtree>;
	leaf: string;
	hasEntry: boolean;
	value: any;
	entry?: Entry;
}
type Subtree = Entry | Map<string, Subtree>;

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
	private static entries = new Map<string, Subtree>;
	private static finalizationRegistry = new FinalizationRegistry<any>(Cache.delete);

	/** Returns `true` if cache has an entry with the given name */
	static has(name: string): boolean {
		return Cache.searchFor(name).hasEntry;
	}

	/** Returns an entry with the given name if it is saved, otherwise returns defaultValue (by default null) */
	static get(name: string, defaultValue: any = null): any {
		const {hasEntry, value} = Cache.searchFor(name);
		return (hasEntry ? value : defaultValue);
	}

	/** Returns all entries that begin with the given name */
	static getLeaves(name: string): any[] {
		const result: any[] = [];
		const {parent, leaf} = Cache.searchFor(name);
		const root = parent.get(leaf);
		if (!root) {
			return result;
		}

		const queue = [root];
		while (queue.length > 0) {
			const node = queue.pop();
			if (node instanceof Map) {
				for (const nextNode of node.values()) {
					queue.push(nextNode);
				}
			} else if (node && node.options.weak) {
				const value = node.value.deref();
				if (value) {
					result.push(value);
				}
			} else if (node) {
				result.push(node.value);
			}
		}
		return result;
	}

	/** Sets a value and options for an entry with the given name */
	static set(name: string, value: any, options: CacheOptions = {}): void {
		const {parent, leaf} = Cache.searchFor(name, true);
		const entry = {value, options, lastAccess: Date.now()};
		if (options.weak) {
			entry.value = new WeakRef(value);
			Cache.finalizationRegistry.register(value, name);
		}
		parent.set(leaf, entry);
	}

	/** Deletes an entry with the given name */
	static delete(name: string): void {
		const {parent, leaf} = Cache.searchFor(name);
		parent.delete(leaf);
	}

	/** Deletes all entries */
	static clear(): void {
		Cache.entries.clear();
	}

	/** Cleans all expired entries */
	static clean(): void {
		Cache.cleanSubtree(Cache.entries);
	}

	/** Cleans the subtree from expired entries (recursively) */
	private static cleanSubtree(subtree: Map<string, Subtree>): void {
		const now = Date.now();
		for (const [name, curr] of subtree) {
			if (curr instanceof Map) {
				Cache.cleanSubtree(curr);
				if (curr.size < 1) {
					subtree.delete(name);
				}
			} else if (!curr.options.weak && now - curr.lastAccess > Const.CACHE_DEFAULT_DURATION_MS) {
				subtree.delete(name);
			}
		}
	}

	/** Returns info for the given name */
	private static searchFor(name: string, shouldCreate = false): SearchInfo {
		let leaf = "", hasEntry = false, value = null;

		const path = name.split("/");
		let curr = Cache.entries, pathPart = "";
		for (let i = 0; i < path.length - 1; i++) {
			pathPart = path[i];
			let next = curr.get(pathPart);
			if (!(next instanceof Map)) {
				if (!shouldCreate) {
					return {parent: curr, leaf, hasEntry, value};
				}
				next = new Map;
				curr.set(pathPart, next);
			}
			curr = next;
		}
		leaf = path[path.length - 1];

		let entry = curr.get(leaf);
		if (entry && !(entry instanceof Map)) {
			hasEntry = true;
			value = entry.value;
			entry.lastAccess = Date.now();
			if (entry.options.weak) {
				value = value.deref();
				if (!value) {
					curr.delete(leaf);
					hasEntry = false;
					entry = undefined;
				}
			}
		} else {
			entry = undefined;
		}
		return {parent: curr, leaf, hasEntry, value, entry};
	}
}