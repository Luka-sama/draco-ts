import assert from "assert/strict";
import {Buffer} from "buffer";
import dgram from "dgram";
import "dotenv/config";
import Logger from "../logger.js";
import UDPSocket from "./udp-socket.js";

export default class UDP {
	/** See https://stackoverflow.com/questions/1098897/what-is-the-largest-safe-udp-packet-size-on-the-internet for details */
	public static readonly MAX_SAFE_PACKET_SIZE = 508;
	public static readonly logger = new Logger(UDP);
	public static maxOptimalPacketCount: number;
	public static attemptCount: number;
	public static sessionTimeout: number;
	public static receiveMaxBytesPerSecond: number;
	public static shouldWaitForNext: number;
	private static socketByAddress = new Map<string, UDPSocket>;
	private static server?: dgram.Socket;
	private static newMessageResolve?: () => void;

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

	public static close(): void {
		assert(UDP.server);
		UDP.server.close();
		delete UDP.server;
	}

	public static send(address: string, port: number, message: Buffer, cb?: () => void): void {
		assert(UDP.server);
		UDP.server.send(message, 0, message.length, port, address, cb);
	}

	public static removeSocket(udpSocket: UDPSocket): void {
		const address = `${udpSocket.address}:${udpSocket.port}`;
		UDP.socketByAddress.delete(address);
	}

	public static waitForMessage(): Promise<void> {
		return new Promise(resolve => {
			UDP.newMessageResolve = resolve;
		});
	}

	private static onMessage(message: Buffer, rinfo: dgram.RemoteInfo): void {
		const address = `${rinfo.address}:${rinfo.port}`;
		const udpSocket = UDP.socketByAddress.get(address) ?? new UDPSocket(rinfo.address, rinfo.port);
		UDP.socketByAddress.set(address, udpSocket);
		udpSocket.receive(message);
		UDP.newMessageResolve?.();
	}
}