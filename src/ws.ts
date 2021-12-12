/**
 * Entity Manager
 *
 * @category ORM
 */
import {EntityManager as EM} from "@mikro-orm/postgresql";
import {Buffer} from "buffer";
import {isString} from "class-validator";
import * as _ from "lodash";
import * as uWS from "uWebSockets.js";
import Account from "./entities/account";
import User from "./entities/user";
import ORM from "./orm";
import {tr} from "./util";
import {WrongDataError} from "./validation";

/**
 * Entity Manager
 *
 * @category ORM
 */
export {EntityManager as EM} from "@mikro-orm/postgresql";
export type JSONData = string | number | boolean | null | Array<JSONData> | UserData;
export type UserData = {[key: string]: JSONData | undefined};
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
	account: Account;
	user: User;

	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data?: UserData): void;

	/** Sends a event "info" with data {text: text} */
	info(text: string): void;
}

/**
 * Type of event handler
 *
 * @category WS
 */
export type EventHandler = (sckOrUser: Socket | User, em: EM, raw: UserData) => Promise<void>;

/**
 * Type of object with router events
 *
 * @category WS
 */
export interface Events {
	[key: string]: EventHandler;
}

/**
 * WS starts Web Socket server and handles getting/sending data
 *
 * @category Base Class
 */
export default class WS {
	static app: uWS.TemplatedApp;
	private static events: Events = {};
	private static port = 9001;

	/** Initializes WebSocket server */
	public static async init(): Promise<void> {
		if (WS.app) {
			return;
		}

		await ORM.init();
		WS.app = uWS.App()
			.ws("/ws", {
				compression: uWS.SHARED_COMPRESSOR,
				maxBackpressure: 512 * 1024,
				open: WS.onOpen,
				message: WS.onMessage
			})
			.listen(WS.port, (listenSocket) => {
				if (listenSocket) {
					console.log(`Listening to port ${WS.port}`);
				}
			});
	}

	/** Sends a message wrapped in the interface WSData to the given socket */
	public static emit(socket: uWS.WebSocket, event: string, data: UserData = {}): void {
		const dataToSend: WSData = {event, data: WS.convertKeysInData(data, _.snakeCase)};
		const json = JSON.stringify(dataToSend);
		if (process.env.WS_DEBUG == "true") {
			console.log(`Sends event ${event} with data ${JSON.stringify(data)}`);
		}
		if (!socket.send(json)) {
			console.error(`Event ${event} was not emitted to account=${socket.account?.id || 0}`);
		}
	}

	/** Adds event to event list */
	public static addEvent(event: string, func: EventHandler): void {
		WS.events[event] = func;
	}

	/** Converts ArrayBuffer to string */
	private static bufferToStr(buffer: ArrayBuffer): string {
		return Buffer.from(buffer).toString();
	}

	/** Handles socket connection. Converts uWS.WebSocket to Socket */
	private static async onOpen(socket: uWS.WebSocket): Promise<void> {
		socket.emit = (event: string, data?: UserData) => WS.emit(socket, event, data);
		socket.info = (text: string) => socket.emit("info", {text});
	}

	/** Handles getting data. Parses JSON, calls [[WS.route]] */
	private static async onMessage(socket: uWS.WebSocket, message: ArrayBuffer): Promise<void> {
		let json: WSData;
		try {
			json = JSON.parse(WS.bufferToStr(message));
		} catch (e) {
			return console.error("uWS JSON parsing error");
		}

		// Validate user input
		if (!isString(json.event) || typeof json.data != "object") {
			return console.error("uWS JSON false schema");
		}

		await WS.route(socket as Socket, json);
	}

	/** Converts all property names in UserData from snake_case to camelCase */
	private static convertKeysInData(data: UserData, func: (str: string) => string): UserData {
		const result: UserData = {};
		for (const key in data) {
			const val = data[key];
			const isObject = (val && typeof val == "object" && !(val instanceof Array));
			result[func(key)] = (isObject ? WS.convertKeysInData(val, func) : val);
		}
		return result;
	}

	/** Calls a function which is defined for this event */
	private static async route(socket: Socket, json: WSData): Promise<void> {
		const handleEvent = WS.events[json.event];
		if (!handleEvent) {
			return console.error(`Unknown event ${json.event} with data ${JSON.stringify(json.data)} from account=${socket.account?.id || 0}`);
		}
		if (process.env.WS_DEBUG == "true") {
			console.log(`Gets event ${json.event} with data ${JSON.stringify(json.data)}`);
		}

		const em = ORM.fork();
		const raw = WS.convertKeysInData(json.data, _.camelCase);
		try {
			await handleEvent(socket, em, raw);
		} catch(e) {
			socket.info( (e instanceof WrongDataError ? tr("WRONG_DATA") : tr("UNKNOWN_ERROR")) );
			console.error(e);
		}
	}
}