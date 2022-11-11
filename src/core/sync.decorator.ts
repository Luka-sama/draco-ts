import assert from "assert/strict";
import _ from "lodash";
import {SyncFor, SyncModel, SyncProperty} from "./sync.typings";

/** The information about which properties in which models and how should be synced */
export const toSync: {
	[key: string]: SyncModel;
} = {};

/** Synchronization decorator. Adds an information about which property in which model and how should be synced */
export default function Sync(options?: SyncProperty | SyncProperty[]): PropertyDecorator {
	return function(target: unknown, propertyKey: string | symbol): void {
		assert(target && typeof target == "object" && typeof target.constructor == "function");
		assert(typeof propertyKey == "string");
		const model = target.constructor.name;
		options = options || {for: SyncFor.This};
		if (!(options instanceof Array)) {
			options = [options];
		}
		for (const a of options) {
			if (options.some(b => a != b && _.isEqual(a.for, b.for))) {
				throw new Error('If a synchronized property has multiple synchronization options, they must all have different "for".');
			}
		}
		_.set(toSync, [model, propertyKey], options);
	};
}