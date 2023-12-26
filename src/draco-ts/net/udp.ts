import assert from "assert/strict";
import {Buffer} from "buffer";
import dgram from "dgram";
import "dotenv/config";
import Logger from "../logger.js";
import UDPSocket from "./udp-socket.js";

/** This class starts UDP server and handles getting/sending data */
export default class UDP {
	/**
	 * See this link for details:
	 * https://stackoverflow.com/questions/1098897/what-is-the-largest-safe-udp-packet-size-on-the-internet
	 */
	public static readonly MAX_SAFE_PACKET_SIZE = 508;
	public static readonly logger = new Logger(UDP);
	/**
	 * If the message should be split into more than `maxOptimalPacketCount` packets to send it via UDP,
	 * it will be sent via web sockets. This parameter is only relevant if the client is connected
	 * via both UDP and web sockets.
	 */
	public static maxOptimalPacketCount: number;
	/** Maximum number of attempts to deliver a message to the client */
	public static attemptCount: number;
	/**
	 * If the server hasn't received any messages from the client (including ping messages) in `sessionTimeout` ms,
	 * the UDP socket will be closed
	 */
	public static sessionTimeout: number;
	/** The limit of bytes per second that the client is allowed to send via UDP */
	public static receiveMaxBytesPerSecond: number;
	/**
	 * How long the server should wait for a missing message to invoke services in the correct order
	 * (see {@link ServiceOptions.correctOrder}
	 */
	public static shouldWaitForNext: number;
	private static server?: dgram.Socket;
	private static socketByAddress = new Map<string, UDPSocket>;
	/** The promise resolve function from {@link UDP.waitForMessage} */
	private static newMessageResolve?: () => void;

	/** Initializes UDP server */
	public static init(): void {
		const port = +process.env.UDP_PORT!;
		assert(!UDP.server && port);

		UDP.server = dgram.createSocket({type: "udp4", sendBufferSize: 1024 ** 3, recvBufferSize: 1024 ** 3});
		UDP.server.on("error", UDP.logger.error);
		UDP.server.on("message", UDP.onMessage);
		UDP.server.bind(port, () => {
			UDP.logger.info(`Listening to port ${port}.`);
		});
	}

	/** Closes UDP server */
	public static close(): void {
		assert(UDP.server);
		UDP.server.close();
		delete UDP.server;
	}

	/** Sends a message to the given address and then calls the given callback */
	public static send(address: string, port: number, message: Buffer, cb?: () => void): void {
		assert(UDP.server);
		UDP.server.send(message, 0, message.length, port, address, cb);
	}

	/** Removes the UDP socket from the list of sockets */
	public static removeSocket(udpSocket: UDPSocket): void {
		const address = `${udpSocket.address}:${udpSocket.port}`;
		UDP.socketByAddress.delete(address);
	}

	/** Waits for a new message from client. This method should only be used for unit testing */
	public static waitForMessage(): Promise<void> {
		return new Promise(resolve => {
			UDP.newMessageResolve = resolve;
		});
	}

	/** Receives a UDP message and passes it to UDP socket */
	private static onMessage(message: Buffer, rinfo: dgram.RemoteInfo): void {
		const address = `${rinfo.address}:${rinfo.port}`;
		const udpSocket = UDP.socketByAddress.get(address) ?? new UDPSocket(rinfo.address, rinfo.port);
		UDP.socketByAddress.set(address, udpSocket);
		udpSocket.receive(message);
		UDP.newMessageResolve?.();
	}
}