import * as uWS from "uWebSockets.js";
import Account from "./auth/account.entity";
import User from "./auth/user.entity";
import {Vector2} from "./math/vector.embeddable";

/**
 * This is the return type of JSON.parse()
 *
 * @category WS
 */
export type JSONData = string | number | boolean | null | JSONData[] | UserData;
/**
 * This is the type of data that we can get from user/send to user
 *
 * @category WS
 */
export type UserData = {[key: string]: JSONData | undefined};
/**
 * This is the type of data that we can get from user after we transform data with {@link ensure}
 *
 * @category WS
 */
export type UserDataExtended = {[key: string]: JSONData | undefined | Vector2 | Vector2[]} | Vector2;

/**
 * Data which we get from user/send to user
 *
 * @category WS
 */
export interface WSData {
	event: string;
	data: UserData;
}

/**
 * WebSocket with additional methods
 *
 * @category WS
 */
export interface Socket extends uWS.WebSocket {
	account?: Account;
	user?: User;
	limits: {
		[key: string]: number[]
	};

	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data?: UserData): void;

	/** Sends an event "info" with data {text: text} */
	info(text: string): void;
}

/**
 * Type of event handler
 *
 * @category WS
 */
export type EventHandler = (args: GuestArgs | LoggedArgs) => Promise<void> | Promise<boolean>;

/**
 * Event arguments for guests and logged only into account
 *
 * @category WS
 */
export interface GuestArgs {
	sck: Socket;
	raw: UserData;
}

/**
 * Event arguments for logged users
 *
 * @category WS
 */
export interface LoggedArgs {
	sck: Socket;
	raw: UserData;
	user: User;
}