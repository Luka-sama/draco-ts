export default class SetUtil {
	/** Merges B into A */
	static merge<T>(A: Set<T>, B: Set<T>): void {
		B.forEach(A.add, A);
	}

	/** Returns set with elements that are both in A and in B */
	static intersection<T>(A: Set<T>, B: Set<T>): Set<T> {
		const result = new Set<T>;
		for (const value of A) {
			if (B.has(value)) {
				result.add(value);
			}
		}
		return result;
	}

	/** Returns set with elements that are in A, but not in B */
	static difference<T>(A: Set<T>, B: Set<T>): Set<T> {
		const result = new Set<T>;
		for (const value of A) {
			if (!B.has(value)) {
				result.add(value);
			}
		}
		return result;
	}
}