import * as uWS from "uWebSockets.js";
import Account from "../auth/account.entity";
import User from "../auth/user.entity";
import {Vector2} from "../math/vector.embeddable";

/** This is the return type of JSON.parse() */
export type JSONData = string | number | boolean | null | JSONData[] | UserData;
/** This is the type for data that we can get from user or send to user */
export type UserData = {[key: string]: JSONData | undefined};
/** This is the type for data that we can get from user after we transform this data with {@link ensure} */
export type UserDataExtended = {[key: string]: JSONData | undefined | Vector2 | Vector2[]} | Vector2;

/** Data which we get from user or send to user with event name */
export interface WSData {
	event: string;
	data: UserData;
}

/** Anything that can emit (user, zone etc) */
export interface Emitter {
	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data?: UserData): void;

	/** Sends an event "info" with data ```{text: text}``` */
	info(text: string): void;
}

/** WebSocket with additional properties */
export interface Socket extends uWS.WebSocket, Emitter {
	account?: Account;
	user?: User;
	limits: {
		[key: string]: number[]
	};
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
}