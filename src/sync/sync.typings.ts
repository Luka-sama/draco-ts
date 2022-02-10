import {AnyEntity, ChangeSet} from "@mikro-orm/core";
import Zone from "../map/zone";
import {JSONData} from "../ws.typings";

/**
 * Synchronization options for a single property
 *
 * @category Synchronization
 */
export interface SyncProperty {
	as?: string;
	value?: any;
	map?: (value: any) => JSONData;
	onChanged?: (value: any) => void;
	hidden?: true;
}

/**
 * Synchronization options
 *
 * @category Synchronization
 */
export interface SyncOptions {
	event: string;
	properties: {
		[key: string]: true | SyncProperty;
	};
	zone?: true | (() => Zone);
	handler?: (changeSet: ChangeSet<AnyEntity>) => Promise<void>;
}