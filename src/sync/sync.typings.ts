/**
 * Synchronization options for a single property
 *
 * @category Synchronization
 */
import {JSONData, UserData} from "../ws.typings";

export interface SyncProperty {
	for?: SyncForCustom;
	as?: string;
	map?: (value: any) => JSONData;
}

/**
 * Synchronization options for a single model
 *
 * @category Synchronization
 */
export interface SyncModel {
	[key: string]: SyncProperty
}

export enum SyncFor {This, Zone}
export type SyncForCustom = string | SyncFor | {
	location: string;
	position: string;
};
export type SyncType = "create" | "update" | "delete";

export interface SyncInfo extends UserData {
	model: string;
	type: SyncType;
	entity: UserData;
}