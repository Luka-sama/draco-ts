import {EntityClass} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import MapUtil from "../util/map-util.js";
import {SyncFor, SyncModel, SyncProperty} from "./sync.typings.js";

/** The information about which properties in which models and how should be synced (see {@link SyncModel}) */
export const toSync = new Map<EntityClass<any>, SyncModel>();

/**
 * Synchronization decorator. Adds an information about which property in which model and how should be synced.
 * See {@link SyncProperty} for details.
 *
 * Be sure to call {@link syncTrack} if you have properties that should not be stored in the database.
 */
export function Sync(options: SyncProperty | SyncProperty[] | SyncFor): PropertyDecorator {
	return function(target: unknown, propertyKey: string | symbol): void {
		assert(target && typeof target == "object" && typeof target.constructor == "function");
		assert(typeof propertyKey == "string");
		const model = target.constructor;

		options = (typeof options == "number" ? {for: options} : options);
		options = (options instanceof Array ? options : [options]);
		for (const a of options) {
			if (options.some(b => a != b && _.isEqual(a.for, b.for))) {
				throw new Error('If a synchronized property has multiple synchronization options, they must all have different "for".');
			}
		}
		MapUtil.getMap(toSync, model).set(propertyKey, options);
	};
}