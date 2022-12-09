import User from "../auth/user.entity";
import {Area} from "../map/area";
import {JSONDataExtended, UserData} from "./ws.typings";

/** Synchronization options for a single property (how this property should be synced) */
export interface SyncProperty {
	/** The recipient emitter */
	for: SyncForCustom;
	/** The name of this property on the client-side */
	as?: string;
	/** The value of this property on the client-side. The string, e.g. "name", is shorthand for `value => value.name` */
	map?: ((value: any) => JSONDataExtended) | string;
}

/** Sync options for a single model */
export interface SyncModel {
	[key: string]: SyncProperty[];
}

/** Any type that extends {@link Area} */
export type AreaType = (new (...args: any) => Area);

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
 * - An area (e.g. RoundArea). In this case an entity method `getAreaParams` that returns constructor params should be provided
 */
export type SyncForCustom = SyncFor | string | {
	location: string;
	position: string;
} | AreaType;

/** Type that shows whether the entity should be created, updated or deleted on the client-side */
export type SyncType = "create" | "update" | "delete";

/** Objects with this info will be sent to the user during sync */
export interface Sync extends UserData {
	model: string;
	type: SyncType;
	entity: UserData;
}

/** A map containing information about which {@link Sync | syncs} should be sent to which users */
export type SyncMap = Map<User, Sync[]>;

/** User container is e.g. zone or area */
export interface UserContainer {
	/** Returns all users from this container */
	getUsers(): Set<User>;
}