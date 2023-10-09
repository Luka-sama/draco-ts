/** Helper class that provides different operations with sets */
export default class SetUtil {
	/** Merges B into A */
	public static merge<T>(A: Set<T>, B: Set<T>): void {
		B.forEach(A.add, A);
	}

	/** Checks if A is superset of B, i.e. all elements of B are also elements of A */
	public static isSuperset<T>(A: Set<T>, B: Set<T>): boolean {
		for (const value of B) {
			if (!A.has(value)) {
				return false;
			}
		}
		return true;
	}

	/** Checks if A is subset of B, i.e. all elements of A are also elements of B */
	public static isSubset<T>(A: Set<T>, B: Set<T>): boolean {
		return SetUtil.isSuperset(B, A);
	}

	/** Checks if A is superset of B, i.e. all elements of B are also elements of A */
	public static haveCommonElements<T>(A: Set<T>, B: Set<T>): boolean {
		for (const value of A) {
			if (B.has(value)) {
				return true;
			}
		}
		return false;
	}

	/** Checks if A and B are equal, i.e. have the same elements */
	public static areEqual<T>(A: Set<T>, B: Set<T>): boolean {
		return SetUtil.isSuperset(A, B) && A.size == B.size;
	}

	/** Returns a set that contains the elements of both A and B */
	public static union<T>(A: Set<T>, B: Set<T>): Set<T> {
		return SetUtil.op(A, B, (hasA, hasB) => hasA || hasB);
	}

	/** Returns a set that contains those elements of A that are also in B */
	public static intersection<T>(A: Set<T>, B: Set<T>): Set<T> {
		return SetUtil.op(A, B, (hasA, hasB) => hasA && hasB);
	}

	/** Returns a set that contains those elements of A that are not in B */
	public static difference<T>(A: Set<T>, B: Set<T>): Set<T> {
		return SetUtil.op(A, B, (hasA, hasB) => hasA && !hasB);
	}

	/** Returns a set of all elements which are in A or B but not both */
	public static symmetricDifference<T>(A: Set<T>, B: Set<T>): Set<T> {
		return SetUtil.op(A, B, (hasA, hasB) => (hasA && !hasB) || (!hasA && hasB));
	}

	/** Returns a set that contains those elements of A and B for which `f` returns true */
	private static op<T>(A: Set<T>, B: Set<T>, f: (hasA: boolean, hasB: boolean) => boolean): Set<T> {
		const result = new Set<T>;
		for (const value of A) {
			if (f(true, B.has(value))) {
				result.add(value);
			}
		}
		if (f(false, true)) {
			for (const value of B) {
				if (!A.has(value)) {
					result.add(value);
				}
			}
		}
		return result;
	}
}