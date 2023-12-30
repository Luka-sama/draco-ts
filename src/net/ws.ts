import assert from "assert/strict";
import {Buffer} from "buffer";
import "dotenv/config";
import uWS from "uWebSockets.js";
import Logger from "../core/logger.js";
import Protobuf from "./protobuf.js";
import Session from "./session.js";

interface WebSocketData {
	session?: Session;
}

export type WebSocket = uWS.WebSocket<WebSocketData>;

/** This class starts WebSocket server and handles getting/sending data */
export default class WS {
	public static readonly logger = new Logger(WS);
	private static app?: uWS.TemplatedApp;
	private static listenSocket?: uWS.us_listen_socket;

	/** Initializes WebSocket server */
	public static init(maxPayloadLength: number): void {
		if (WS.app) {
			return;
		}

		const config: uWS.WebSocketBehavior<WebSocketData> = {
			maxPayloadLength,
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

	/** Closes WebSocket server */
	public static close(): void {
		if (WS.listenSocket) {
			uWS.us_listen_socket_close(WS.listenSocket);
			delete WS.listenSocket;
			delete WS.app;
		}
	}

	/** Sends a message to the given web socket */
	public static send(webSocket: WebSocket, message: Buffer): void {
		const statusCode = webSocket.send(message, true, false);
		if (statusCode == 2) {
			WS.logger.debug(`The message could not be send.`);
		}
	}

	/** Handles socket connection. Sends protobuf types as JSON */
	private static onOpen(webSocket: WebSocket): void {
		const json = JSON.stringify({typeInfos: Protobuf.typeInfos});
		const statusCode = webSocket.send(json, false, false);
		if (statusCode == 2) {
			WS.logger.debug(`JSON with type infos was not sent.`);
		}
	}

	/** Handles socket disconnection */
	private static onClose(webSocket: WebSocket): void {
		webSocket.getUserData().session?.unbindWebSocket();
	}

	/** Handles getting data. Passes the message to the session or tries to establish a session if it is missing */
	private static async onMessage(webSocket: WebSocket, arrayBuffer: ArrayBuffer): Promise<void> {
		const session = webSocket.getUserData()?.session;
		const message = Buffer.from(arrayBuffer);
		if (session) {
			return await session.receive(message);
		}
		await WS.establishSession(webSocket, message);
	}

	/** Establishes a session (either with the given token or a new one) */
	private static async establishSession(webSocket: WebSocket, message: Buffer): Promise<void> {
		const newSession = message.equals(Buffer.from([0]));
		const session = (newSession ? await Session.create() : Session.getByToken(message));
		if (!session) {
			webSocket.end();
			return WS.logger.debug(`Wrong session token or a message without active session (message length ${message.length}).`);
		}
		session.bindWebSocket(webSocket);
		WS.send(webSocket, session.token);
	}
}