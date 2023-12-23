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
	private static socketByAddress = new Map<string, UDPSocket>;
	private static server?: dgram.Socket;

	public static init(): void {
		const port = +process.env.UDP_PORT!;
		assert(!UDP.server && port);

		UDP.server = dgram.createSocket("udp4");
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

	public static send(address: string, port: number, message: Buffer, callback?: () => void): void {
		assert(UDP.server);
		UDP.server.send(message, 0, message.length, port, address, callback);
	}

	public static removeSocket(udpSocket: UDPSocket): void {
		const address = `${udpSocket.address}:${udpSocket.port}`;
		this.socketByAddress.delete(address);
	}

	private static async onMessage(message: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
		if (message.length < 1) {
			return UDP.logger.debug(`The received message is empty.`);
		}

		const address = `${rinfo.address}:${rinfo.port}`;
		const udpSocket = UDP.socketByAddress.get(address) ?? new UDPSocket(rinfo.address, rinfo.port);
		UDP.socketByAddress.set(address, udpSocket);
		udpSocket.receive(message);
	}
}