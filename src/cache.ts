export default class Cache {
	private static entries = {};
	private static started = false;

	static init() {
		if (Cache.started) {
			return;
		}
		Cache.started = true;
	}

	static has(name: string): boolean {
		const path = name.split("/");
		let curr: any = Cache.entries;
		for (const pathPart of path) {
			if (!(pathPart in curr)) {
				return false;
			}
			curr = curr[pathPart];
		}
		return true;
	}

	static get(name: string, defaultValue: any = null): any {
		const path = name.split("/");
		let curr: any = Cache.entries;
		for (const pathPart of path) {
			if (!(pathPart in curr)) {
				return defaultValue;
			}
			curr = curr[pathPart];
		}
		return curr;
	}

	static set(name: string, value: any): void {
		const path = name.split("/");
		let curr: any = Cache.entries;
		for (let i = 0; i < path.length; i++) {
			const pathPart = path[i];
			if (i + 1 == path.length) {
				curr[pathPart] = value;
			} else {
				if (!(pathPart in curr)) {
					curr[pathPart] = {};
				}
				curr = curr[pathPart];
			}
		}
	}

	static getOrSet(name: string, calcValue: () => any) {
		if (Cache.has(name)) {
			return Cache.get(name);
		}
		const value = calcValue();
		Cache.set(name, value);
		return value;
	}

	static delete(name: string): void {

	}
}