export default class MapUtil {
	static get<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
		const value = map.get(key);
		if (value === undefined) {
			map.set(key, defaultValue);
			return defaultValue;
		}
		return value;
	}

	static getArray<K, V extends any[]>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, [] as unknown as V);
	}

	static getMap<K, V extends Map<any, any>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new Map as unknown as V);
	}

	static getSet<K, V extends Set<any>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new Set as unknown as V);
	}

	static getWeakMap<K, V extends WeakMap<any, any>>(map: Map<K, V>, key: K): V {
		return MapUtil.get(map, key, new WeakMap as unknown as V);
	}
}