import {Buffer} from "buffer";
import * as uWS from "uWebSockets.js";
import events from "./events";

/**
 * Data which we get from user/send to user
 *
 * @category WS
 */
export interface WSData {
	event: string;
	data: unknown;
}

/**
 * WebSocket with additional methods
 *
 * @category WS
 */
export interface Socket extends uWS.WebSocket {
	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data: unknown): void;
}

/**
 * Type of object with router events
 *
 * @category WS
 */
export interface Events {
	[key: string]: Function;
}

/**
 * WS starts Web Socket server and handles getting/sending data
 *
 * @category Base Class
 */
export default class WS {
	static app: uWS.TemplatedApp;

	/** Initializes WebSocket server */
	public static init(): void {
		if (WS.app) {
			return;
		}

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
	public static emit(socket: uWS.WebSocket, event: string, data: unknown): void {
		const dataToSend: WSData = {event, data};
		const json = JSON.stringify(dataToSend);
		socket.send(json);
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
		if (!json.event || json.data === undefined) {
			return console.error("uWS JSON false schema");
		}
		socket.emit = (event: string, data: unknown) => WS.emit(socket, event, data);
		WS.route(socket as Socket, json);
	}

	/** Calls a function which is defined for this event */
	private static route(socket: Socket, json: WSData): void {
		const event = events[json?.event];
		if (event) {
			event(socket, json.data);
		}
	}
}