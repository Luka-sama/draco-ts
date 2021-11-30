import {Buffer} from "buffer";
import * as uWS from "uWebSockets.js";
import Account from "./entities/account";
import User from "./entities/user";
import ORM from "./orm";

export {EntityManager as EM} from "@mikro-orm/postgresql";

type JSONData = string | number | boolean | null | Array<JSONData> | UserData;
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
	player: User;

	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data: unknown): void;
}

/**
 * Type of object with router events
 *
 * @category WS
 */
interface Events {
	[key: string]: Function;
}

/**
 * WS starts Web Socket server and handles getting/sending data
 *
 * @category Base Class
 */
export default class WS {
	static app: uWS.TemplatedApp;
	private static events: Events = {};

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
				message: WS.onMessage
			})
			.listen(9001, (listenSocket) => {
				if (listenSocket) {
					console.log("Listening to port 9001");
				}
			});
	}

	/** Sends a message wrapped in the interface WSData to the given socket */
	public static emit(socket: uWS.WebSocket, event: string, data: UserData): void {
		const dataToSend: WSData = {event, data};
		const json = JSON.stringify(dataToSend);
		if (!socket.send(json)) {
			console.error(`Event ${event} was not emitted`);
		}
	}

	public static addEvent(event: string, func: Function): void {
		WS.events[event] = func;
	}

	/** Converts ArrayBuffer to string */
	private static bufferToStr(buffer: ArrayBuffer): string {
		return Buffer.from(buffer).toString();
	}

	/** Handles getting data. Parses JSON, converts uWS.WebSocket to Socket, calls [[WS.route]] */
	private static onMessage(socket: uWS.WebSocket, message: ArrayBuffer): void {
		let json: WSData;
		try {
			json = JSON.parse(WS.bufferToStr(message));
		} catch (e) {
			return console.error("uWS JSON parsing error");
		}

		// Validate user input
		if (typeof json.event != "string" || typeof json.data != "object") {
			return console.error("uWS JSON false schema");
		}
		socket.emit = (event: string, data: UserData) => WS.emit(socket, event, data);
		WS.route(socket as Socket, json);
	}

	/** Calls a function which is defined for this event */
	private static async route(socket: Socket, json: WSData): Promise<void> {
		const event = WS.events[json?.event];
		if (!event) {
			return;
		}

		const em = ORM.fork();
		try {
			await event(socket, em, json.data);
		} catch(e) {
			console.error(e);
		}
	}
}