import assert from "assert/strict";
import {Buffer} from "buffer";
import "dotenv/config";
import uWS, {WebSocketBehavior} from "uWebSockets.js";
import Logger from "../logger.js";
import Protobuf from "./protobuf.js";
import Session from "./session.js";

interface UserData {
	session?: Session;
}

export type WebSocket = uWS.WebSocket<UserData>;

/** This class starts WebSocket server and handles getting/sending data */
export default class WS {
	//public static emitter = new EventEmitter;
	public static logger = new Logger(WS);
	private static app?: uWS.TemplatedApp;
	private static listenSocket?: uWS.us_listen_socket;

	/** Initializes WebSocket server */
	static init(): void {
		if (WS.app) {
			return;
		}

		const config: WebSocketBehavior<UserData> = {
			open: WS.onOpen,
			message: WS.onMessage,
			close: WS.onClose,
		};
		const port = +process.env.WS_PORT!;
		const path = process.env.WS_PATH;
		assert(port && path);

		WS.app = uWS.App();
		WS.app.listen(port, listenSocket => {
			if (listenSocket) {
				WS.listenSocket = listenSocket;
				WS.logger.info(`Listening to port ${port}.`);
			} else {
				WS.logger.error(`Failed to listen to port ${port}.`);
			}
		});
		WS.app.ws(path, config);
	}

	public static getApp(): uWS.TemplatedApp {
		assert(WS.app);
		return WS.app;
	}

	public static close(): void {
		if (WS.listenSocket) {
			uWS.us_listen_socket_close(WS.listenSocket);
			delete WS.listenSocket;
			delete WS.app;
		}
	}

	/** Sends a message wrapped in the interface WSData to the given socket */
	public static send(webSocket: WebSocket, message: Buffer): boolean {
		return webSocket.send(message, true, false) == 1;
	}

	/** Handles socket connection. Converts uWS.WebSocket to Socket */
	private static onOpen(webSocket: WebSocket): void {
		const json = JSON.stringify({typeInfos: Protobuf.typeInfos});
		if (webSocket.send(json, false, false) != 1) {
			WS.logger.warn(`JSON with type infos was not sent.`);
		}
		//WS.emitter.emit("open", webSocket);
	}

	/** Handles socket close event */
	private static onClose(webSocket: WebSocket): void {
		webSocket.getUserData().session?.removeWebSocket();
		//WS.emitter.emit("close", webSocket);
	}

	/** Handles getting data. Decodes a protobuf message and invokes the corresponding service */
	private static async onMessage(webSocket: WebSocket, message: ArrayBuffer): Promise<void> {
		const userData = webSocket.getUserData();
		const session = userData.session;
		if (session) {
			await session.receive(Buffer.from(message));
			return;
		}

		const bufferAsString = Buffer.from(message).toString();
		let json: unknown;
		try {
			json = JSON.parse(bufferAsString);
		} catch(e) {
			return WS.logger.warn("Could not decode JSON.");
		}
		if (!json || typeof json != "object" || json instanceof Array) {
			WS.logger.warn("Wrong JSON.");
			return;
		}
		if ("token" in json && typeof json.token == "string") {
			userData.session = Session.getByToken(json.token);
			if (!userData.session) {
				WS.logger.warn(`Wrong session token ${json.token}.`);
			}
		} else if ("newSession" in json) {
			userData.session = await Session.create();
		}
		userData.session?.setWebSocket(webSocket);
	}
}