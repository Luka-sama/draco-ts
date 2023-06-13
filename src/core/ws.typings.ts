import * as uWS from "uWebSockets.js";
import Account from "../auth/account.entity.js";
import User from "../auth/user.entity.js";
import Zone from "../map/zone.js";
import {Vector2} from "../util/vector.embeddable.js";

/** This is the return type of JSON.parse() */
export type JSONData = string | number | boolean | null | JSONData[] | UserData;
/** This is the type that can be transformed to JSON */
export type JSONDataExtended = string | number | boolean | null | Vector2 | JSONDataExtended[] | UserData;
/** This is the type for the data that we can get from a user or send to a user */
export type UserData = {[key: string]: JSONData | undefined};
/** This is the type for the data that we can get from a user after we transform this data with {@link ensure} */
export type UserDataExtended = {[key: string]: JSONData | undefined | Vector2 | Vector2[]} | Vector2;

/** Data which we get from a user or send to a user with event name */
export interface WSData {
	event: string;
	data: UserData;
}

/** Anything you can emit events to (user, zone etc) */
export interface Receiver {
	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data?: UserData): void;

	/** Sends an event "info" with data `{text: text}` */
	info(text: string): void;
}

/** WebSocket with additional properties */
export interface Socket extends uWS.WebSocket, Receiver {
	account?: Account;
	user?: User;
}

/** Type for an event handler */
export type EventHandler = (args: GuestArgs | LoggedArgs) => Promise<void> | Promise<boolean>;

/** Event arguments for guests and logged only into account */
export interface GuestArgs {
	sck: Socket;
	raw: UserData;
}

/** Event arguments for logged users */
export interface LoggedArgs {
	sck: Socket;
	raw: UserData;
	user: User;
	zone: Zone;
}