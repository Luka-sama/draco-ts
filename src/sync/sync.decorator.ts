import assert from "assert/strict";
import Synchronization from "./sync";
import type {SyncOptions} from "./sync.typings";

/**
 * Synchronization decorator
 *
 * @category Synchronization
 */
export default function Sync(optionsOrList: SyncOptions | SyncOptions[]): ClassDecorator {
	const list = (optionsOrList instanceof Array ? optionsOrList : [optionsOrList]);
	return function(target: unknown): void {
		assert(typeof target == "function");
		Synchronization.addToSyncData(target.name, list);
	};
}