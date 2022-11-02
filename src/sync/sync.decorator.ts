import assert from "assert/strict";
import Synchronizer from "./sync";
import {SyncProperty} from "./sync.typings";

/**
 * Synchronization decorator
 *
 * @category Synchronization
 */
export default function Sync(options?: SyncProperty): PropertyDecorator {
	return function(target: unknown, propertyKey: string | symbol): void {
		assert(target && typeof target == "object" && typeof target.constructor == "function");
		assert(typeof propertyKey == "string");
		assert( (propertyKey == "id" ? !options : options) );
		Synchronizer.addToSyncData(target.constructor.name, propertyKey, options || {});
	};
}