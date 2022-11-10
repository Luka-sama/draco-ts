import assert from "assert/strict";
import _ from "lodash";
import Synchronizer from "./sync";
import {SyncFor, SyncProperty} from "./sync.typings";

/** Synchronization decorator */
export default function Sync(options?: SyncProperty | SyncProperty[]): PropertyDecorator {
	return function(target: unknown, propertyKey: string | symbol): void {
		assert(target && typeof target == "object" && typeof target.constructor == "function");
		assert(typeof propertyKey == "string");
		options = options || {for: SyncFor.This};
		if (!(options instanceof Array)) {
			options = [options];
		}
		for (const a of options) {
			if (options.some(b => a != b && _.isEqual(a.for, b.for))) {
				throw new Error('If a synchronized property has multiple synchronization options, they must all have different "for".');
			}
		}
		Synchronizer.addToSyncProperty(target.constructor.name, propertyKey, options);
	};
}