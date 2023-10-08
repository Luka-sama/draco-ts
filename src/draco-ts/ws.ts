import assert from "assert/strict";
import {Buffer} from "buffer";
import _ from "lodash";
import {EventEmitter} from "node:events";
import uWS from "uWebSockets.js";
import {EndOfRequest} from "./limit.js";
import Logger from "./logger.js";
import {ensure, Is, JSONData, UserData, WrongDataError} from "./util/validation.js";

/** Anything you can emit events to (user, zone etc) */
export interface Receiver {
	/** Sends a message wrapped in the interface WSData */
	emit(event: string, data?: UserData): void;
}

/** WebSocket with additional properties */
export interface Socket extends uWS.WebSocket, Receiver {}

/** Type for an event handler */
export type EventHandler = (args: GuestArgs) => Promise<void> | Promise<boolean>;

/** Event arguments for guests and logged only into account */
export interface GuestArgs {
	sck: Socket;
	raw: UserData;
}

/** Data which we get from a user or send to a user with event name */
interface WSData {
	event: string;
	data: UserData;
}

/** This class starts WebSocket server and handles getting/sending data */
export default class WS {
	public static emitter = new EventEmitter;
	public static logger = new Logger(WS);
	private static app: uWS.TemplatedApp;
	private static listenSocket: uWS.WebSocket;
	private static events: {
		[key: string]: EventHandler;
	} = {};

	/** Initializes WebSocket server */
	static init(): void {
		if (WS.app) {
			return;
		}

		const port = +process.env.WS_PORT!;
		WS.app = uWS.App()
			.ws("/ws", {
				compression: uWS.SHARED_COMPRESSOR,
				maxBackpressure: 512 * 1024,
				open: WS.onOpen,
				message: WS.onMessage,
				close: WS.onClose
			})
			.listen(port, listenSocket => {
				if (listenSocket) {
					WS.listenSocket = listenSocket;
					WS.logger.info(`Listening to port ${port}.`);
				} else {
					WS.logger.error(`Failed to listen to port ${port}.`);
				}
			});
	}

	static getApp(): uWS.TemplatedApp {
		return WS.app;
	}

	static close() {
		uWS.us_listen_socket_close(WS.listenSocket);
	}

	/** Sends a message wrapped in the interface WSData to the given socket */
	static emit(sck: uWS.WebSocket, event: string, data: UserData = {}): void {
		const json = WS.prepareDataBeforeEmit(event, data);
		if (sck.send(json, false, true) != 1) {
			WS.logger.warn(`Event ${event} was not emitted to account=${sck.account?.id || 0}`);
		}
	}

	/** Adds an event to the event list */
	static addEvent(event: string, func: EventHandler): void {
		WS.events[event] = func;
	}

	/**
	 * Creates an object composed of the picked object properties (or object list with such objects)
	 *
	 * If property is not JSONData, tries to apply method toPlain(). If it fails, throws an error.
	 * If no keys provided, it picks all existing keys (i.e. it simply converts object to user data).
	 **/
	static prepare<T>(list: T, keys?: string[]): T extends unknown[] ? UserData[] : UserData {
		if (list instanceof Set) {
			return WS.prepareArray(Array.from(list), keys) as any;
		}
		return (list instanceof Array ? WS.prepareArray(list, keys) : WS.prepareOne(list, keys)) as any;
	}

	/** A helper method for {@link prepare} */
	private static prepareArray(list: any[], keys?: string[]): UserData[] {
		return list.map(object => {
			if (object instanceof Array) {
				throw new Error(`Tried to send wrong data to user (${object}, is array)`);
			}
			return WS.prepareOne(object, keys);
		});
	}

	/** A helper method for {@link prepare} */
	private static prepareOne(object: any, keys?: string[]): UserData {
		if (typeof object != "object") {
			throw new Error(`Tried to send wrong data to user (${object}, typeof=${typeof object})`);
		}

		const picked = (keys ? _.pick(object, keys) : object);
		for (const key in picked) {
			picked[key] = WS.prepareValue(picked[key], key);
		}
		return picked;
	}

	/** A helper method for {@link prepareOne} */
	private static prepareValue(value: any, key: string): JSONData {
		const type = typeof value;
		if (["bigint", "function", "symbol", "undefined"].includes(type)) {
			throw new Error(`Tried to send wrong data to user (key=${key}, value=${value}, typeof=${type})`);
		} else if (value instanceof Array) {
			return value.map(el => WS.prepareValue(el, key));
		} else if (type == "object" && !_.isPlainObject(value) && value != null) {
			if (typeof value.toPlain != "function") {
				throw new Error(`Tried to send wrong data to user (key=${key}, object=${value.constructor?.name})`);
			}
			return value.toPlain();
		}
		return value;
	}

	/** Converts ArrayBuffer to string */
	private static bufferToStr(buffer: ArrayBuffer): string {
		return Buffer.from(buffer).toString();
	}

	/** Converts ArrayBuffer to WSData */
	private static bufferToWSData(buffer: ArrayBuffer): WSData | null {
		try {
			const json = JSON.parse(WS.bufferToStr(buffer));
			if (!json || typeof json != "object" || json instanceof Array) {
				return null;
			}
			return ensure(json, {event: Is.string, data: {}}, true);
		} catch(e) {
			return null;
		}
	}

	/** Handles socket connection. Converts uWS.WebSocket to Socket */
	private static onOpen(sck: uWS.WebSocket): void {
		sck.emit = function(event: string, data?: UserData): void {
			WS.emit(sck, event, data);
		};
		WS.emitter.emit("open", sck as Socket);
	}

	/** Handles socket close event */
	private static onClose(sck: uWS.WebSocket): void {
		WS.emitter.emit("close", sck as Socket);
	}

	/** Handles getting data. Parses JSON, calls {@link WS.route} */
	private static async onMessage(sck: uWS.WebSocket, message: ArrayBuffer): Promise<void> {
		const data = WS.bufferToWSData(message);
		if (!data) {
			return WS.logger.error("uWS JSON parsing error or false schema");
		}
		await WS.route(sck as Socket, data);
	}

	/** Converts all property names in UserData from snake_case to camelCase */
	private static convertKeysInData(data: UserData, func: (str: string) => string): UserData {
		const result: UserData = {};
		for (const key in data) {
			const val = data[key];
			const newKey = func(key);
			if (val instanceof Array) {
				result[newKey] = WS.convertKeysInArray(val, func);
			} else if (val && typeof val == "object") {
				result[newKey] = WS.convertKeysInData(val, func);
			} else {
				result[newKey] = val;
			}
		}
		return result;
	}

	/** Converts all property names in JSONData[] from snake_case to camelCase */
	private static convertKeysInArray(data: JSONData[], func: (str: string) => string): JSONData[] {
		return data.map(el => {
			if (el instanceof Array) {
				return WS.convertKeysInArray(el, func);
			}
			if (el && typeof el == "object") {
				return WS.convertKeysInData(el, func);
			}
			return el;
		});
	}

	/** Converts data to JSON with snake case */
	private static prepareDataBeforeEmit(event: string, data: UserData): string {
		const dataToSend: WSData = {event, data: WS.convertKeysInData(data, _.snakeCase)};
		const json = JSON.stringify(dataToSend);
		if (event != "pong") {
			WS.logger.info(`Sends event ${event} with data ${JSON.stringify(data)}`);
		}
		return json;
	}

	/** Calls a function which is defined for this event */
	private static async route(sck: Socket, json: WSData): Promise<void> {
		const handleEvent = WS.events[json.event];
		if (!handleEvent) {
			WS.logger.error(`Unknown event ${json.event} with data ${JSON.stringify(json.data)} from account=${sck.account?.id || 0}`);
			return;
		}
		if (json.event != "ping") {
			WS.logger.info(`Gets event ${json.event} with data ${JSON.stringify(json.data)}`);
		}

		const raw = WS.convertKeysInData(json.data, _.camelCase);

		try {
			await handleEvent({sck, raw} as GuestArgs);
		} catch(e) {
			if (!(e instanceof Error) || !["AbortError", "EndOfRequest"].includes(e.name)) {
				const isWrongData = (e instanceof WrongDataError || e instanceof assert.AssertionError);
				WS.logger.error(e);
				WS.emitter.emit("error", sck, isWrongData);
			}
		}
	}
}