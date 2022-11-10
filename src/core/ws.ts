import {RequestContext} from "@mikro-orm/core";
import assert from "assert/strict";
import {Buffer} from "buffer";
import _ from "lodash";
import uWS from "uWebSockets.js";
import User from "../auth/user.entity";
import {EM} from "./orm";
import {tr} from "./util";
import {ensure, Is, WrongDataError} from "./validation";
import {EventHandler, GuestArgs, Socket, UserData, WSData} from "./ws.typings";

/** This class starts WebSocket server and handles getting/sending data */
export default class WS {
	private static app: uWS.TemplatedApp;
	private static events: {
		[key: string]: EventHandler;
	} = {};
	private static port = 9001;

	/** Initializes WebSocket server */
	static init(): void {
		if (WS.app) {
			return;
		}

		WS.app = uWS.App()
			.ws("/ws", {
				compression: uWS.SHARED_COMPRESSOR,
				maxBackpressure: 512 * 1024,
				open: WS.onOpen,
				message: WS.onMessage,
				close: WS.onClose
			})
			.listen(WS.port, listenSocket => {
				if (listenSocket) {
					console.log(`Listening to port ${WS.port}`);
				}
			});
	}

	/** Sends a message wrapped in the interface WSData to the given socket */
	static emit(sck: uWS.WebSocket, event: string, data: UserData = {}): void {
		const json = WS.prepareDataBeforeEmit(event, data);
		console.assert(sck.send(json), `Event ${event} was not emitted to account=${sck.account?.id || 0}`);
	}

	/** Adds an event to the event list */
	static addEvent(event: string, func: EventHandler): void {
		WS.events[event] = func;
	}

	/** Subscribes the socket or the user to a topic or topics */
	static sub(sckOrUser: Socket | User, topics: string | string[]): void {
		const sck = (sckOrUser instanceof User ? sckOrUser.socket! : sckOrUser);
		if (!(topics instanceof Array)) {
			topics = [topics];
		}
		for (const topic of topics) {
			console.assert(sck.subscribe(topic), `Error subscribe ${topic}`);
		}
	}

	/** Unsubscribes the socket or the user from a topic or topics */
	static unsub(sckOrUser: Socket | User, topics: string | string[]): void {
		const sck = (sckOrUser instanceof User ? sckOrUser.socket! : sckOrUser);
		if (!(topics instanceof Array)) {
			topics = [topics];
		}
		for (const topic of topics) {
			console.assert(sck.unsubcribe(topic), `Error unsubcribe ${topic}`);
		}
	}

	/** Sends a message to all users that are subscribed to the given topics */
	static pub(topics: string | string[], event: string, data: UserData = {}): void {
		const json = WS.prepareDataBeforeEmit(event, data);
		if (!(topics instanceof Array)) {
			topics = [topics];
		}
		for (const topic of topics) {
			WS.app.publish(topic, json);
		}
	}

	/** Returns all topics to them the socket or the user is subscribed */
	static getTopics(sckOrUser: Socket | User, startsWith?: string): string[] {
		const sck = (sckOrUser instanceof User ? sckOrUser.socket! : sckOrUser);
		const topics = sck.getTopics();
		if (startsWith) {
			return topics.filter(topic => topic.startsWith(startsWith));
		}
		return topics;
	}

	/**
	 * Creates an object composed of the picked object properties (or object list with such objects)
	 *
	 * If property is not JSONData, tries to apply method toPlain(). If it fails, throws an error.
	 **/
	static prepare<T>(list: T, keys: string[]): T extends unknown[] ? UserData[] : UserData {
		if (list instanceof Set) {
			return WS.prepareArray(Array.from(list), keys) as any;
		}
		return (list instanceof Array ? WS.prepareArray(list, keys) : WS.prepareOne(list, keys)) as any;
	}

	/** A helper method for {@link prepare} */
	private static prepareArray(list: any[], keys: string[]): UserData[] {
		return list.map(object => {
			if (object instanceof Array) {
				throw new Error(`Tried to send wrong data to user (${object}, is array)`);
			}
			return WS.prepareOne(object, keys);
		});
	}

	/** A helper method for {@link prepare} */
	private static prepareOne(object: any, keys: string[]): UserData {
		if (typeof object != "object") {
			throw new Error(`Tried to send wrong data to user (${object}, typeof=${typeof object})`);
		}

		const picked = _.pick(object, keys);
		for (const key in picked) {
			const value: any = picked[key];
			const type = typeof value;
			if (["bigint", "function", "symbol", "undefined"].includes(type)) {
				throw new Error(`Tried to send wrong data to user (key=${key}, value=${value}, typeof=${type})`);
			} else if (type == "object" && !_.isPlainObject(value)) {
				if (typeof value.toPlain != "function") {
					throw new Error(`Tried to send wrong data to user (key=${key}, object=${object.constructor?.name})`);
				}
				picked[key] = value.toPlain();
			}
		}
		return picked;
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
		sck.limits = {};
		sck.emit = function(event: string, data?: UserData): void {
			WS.emit(sck, event, data);
		};
		sck.info = function(text: string): void {
			sck.emit("info", {text});
		};
	}

	/** Handles socket close event */
	private static onClose(sck: uWS.WebSocket): void {
		if (sck.user) {
			const user = sck.user as User;
			user.connected = false;
			delete user.socket;
		}
	}

	/** Handles getting data. Parses JSON, calls {@link WS.route} */
	private static async onMessage(sck: uWS.WebSocket, message: ArrayBuffer): Promise<void> {
		const data = WS.bufferToWSData(message);
		if (!data) {
			return console.error("uWS JSON parsing error or false schema");
		}
		await WS.route(sck as Socket, data);

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

	/** Converts data to JSON with snake case */
	private static prepareDataBeforeEmit(event: string, data: UserData): string {
		const dataToSend: WSData = {event, data: WS.convertKeysInData(data, _.snakeCase)};
		const json = JSON.stringify(dataToSend);
		if (process.env.WS_DEBUG == "true") {
			console.log(`Sends event ${event} with data ${JSON.stringify(data)}`);
		}
		return json;
	}

	/** Calls a function which is defined for this event */
	private static async route(sck: Socket, json: WSData): Promise<void> {
		const handleEvent = WS.events[json.event];
		if (!handleEvent) {
			return console.error(`Unknown event ${json.event} with data ${JSON.stringify(json.data)} from account=${sck.account?.id || 0}`);
		}
		if (process.env.WS_DEBUG == "true") {
			console.log(`Gets event ${json.event} with data ${JSON.stringify(json.data)}`);
		}

		const raw = WS.convertKeysInData(json.data, _.camelCase);

		await RequestContext.createAsync(EM, async function() {
			if (sck.account) {
				EM.persist(sck.account);
			}
			if (sck.user) {
				EM.persist(sck.user);
			}
			try {
				await handleEvent({sck, raw} as GuestArgs);
				await EM.flush();
			} catch (e) {
				sck.info(e instanceof WrongDataError || e instanceof assert.AssertionError ? tr("WRONG_DATA") : tr("UNKNOWN_ERROR"));
				console.error(e);
			}
		});
	}
}