/** Helper class that provides different operations with maps */
export default class MapUtil {
	/** Returns an element of `map` with the given key. If this element doesn't exist, it will first create it with value `defaultValue` */
	public static get<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
		const value = map.get(key);
		if (value === undefined) {
			map.set(key, defaultValue);
			return defaultValue;
		}
		return value;
	}

	/** Shortcut for `MapUtil.get(map, key, [])`. See {@link MapUtil.get} for details */
	public static getArray<K, V extends unknown[]>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, [] as unknown as V);
	}

	/** Shortcut for `MapUtil.get(map, key, new Map)`. See {@link MapUtil.get} for details */
	public static getMap<K, V extends Map<unknown, unknown>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new Map as V);
	}

	/** Shortcut for `MapUtil.get(map, key, new Set)`. See {@link MapUtil.get} for details */
	public static getSet<K, V extends Set<unknown>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new Set as V);
	}

	/** Shortcut for `MapUtil.get(map, key, new WeakMap)`. See {@link MapUtil.get} for details */
	public static getWeakMap<K, V extends WeakMap<object, unknown>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new WeakMap as V);
	}

	/** Shortcut for `MapUtil.get(map, key, new WeakSet)`. See {@link MapUtil.get} for details */
	public static getWeakSet<K, V extends WeakSet<object>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new WeakSet as V);
	}
}