/** Synchronization options for a single property */
import {Emitter, JSONData, UserData} from "./ws.typings";

/** Property options: the details on how property should be synced */
export interface SyncProperty {
	/** The recipient emitter */
	for: SyncForCustom;
	/** The name of this property on the client-side */
	as?: string;
	/** The value of this property on the client-side */
	map?: (value: any) => JSONData;
}

/** Sync options for a single model */
export interface SyncModel {
	[key: string]: SyncProperty[]
}

/**
 * Which emitter should be used?
 * - This: sync infos will be sent to this entity (it will be called "emit" on this entity)
 * - Zone: sync infos will be sent to all users in the zone of this entity (the fields "location" and "position" will be used)
 */
export enum SyncFor {This, Zone}

/**
 * Which emitter should be used?
 * - {@link SyncFor} (most commonly used)
 * - A string with the name of a field that contains ID of the recipient user
 * - An object with the names of fields that contain location and position of the recipient zone
 */
export type SyncForCustom = SyncFor | string | {
	location: string;
	position: string;
};

/** Type that shows whether the entity should be created, updated or deleted on the client-side */
export type SyncType = "create" | "update" | "delete";

/** Objects with this info will be sent to the user during sync */
export interface SyncInfo extends UserData {
	model: string;
	type: SyncType;
	entity: UserData;
}

export type SyncInfoMap = Map<Emitter, SyncInfo[]>;