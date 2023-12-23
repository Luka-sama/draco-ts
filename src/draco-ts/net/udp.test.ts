import assert from "assert/strict";
import dgram from "dgram";
import {after, before, test} from "node:test";
import {setTimeout} from "timers/promises";
import {ClassWithInfo} from "../type-analyzer/class-info.js";
import ClassLoader from "../type-analyzer/class-loader.js";
import TypeAnalyzer from "../type-analyzer/type-analyzer.js";
import {Typings, UInt32} from "../typings.js";
import Message from "./message.js";
import Protobuf from "./protobuf.js";
import Service from "./service.js";
import Session from "./session.js";
import UDPSocket from "./udp-socket.js";
import UDP from "./udp.js";

export class UDPTestMessage extends Message {
	public testString!: string;
	public testNumber!: UInt32;
}

export class UDPTestService extends Service {
	public static calledWith = {testString: "", testNumber: 0};
	public testString!: string;
	public testNumber!: UInt32;

	public run({testString, testNumber}: this): void {
		UDPTestService.calledWith = {testString, testNumber};
	}
}

let send: (message: Buffer) => Promise<void>;
let session: Session;
let lastMessage: Buffer;
before(async () => {
	TypeAnalyzer.init(["**/net/*.d.ts", "**/typings.d.ts"]);

	const types: ClassWithInfo[] = [];
	const messages: ClassWithInfo[] = [
		await ClassLoader.findOrThrowWithInfo(UDPTestMessage),
	];
	const services: ClassWithInfo[] = [
		await ClassLoader.findOrThrowWithInfo(UDPTestService),
	];
	const typings = await ClassLoader.findOrThrow(Typings);
	Protobuf.init(types, messages, services, 1, typings);
	Protobuf["opcodeByClassMap"].set(UDPTestMessage, 255);

	UDP.init();
	const address = "127.0.0.1";
	const port = +process.env.UDP_PORT!;
	const client = dgram.createSocket("udp4");
	client.on("message", message => {
		lastMessage = message;
	});
	client.unref();
	session = await Session.create();
	send = async message => {
		client.send(message, 0, message.length, port, address);
		await setTimeout(10);
	};
});

after(() => {
	UDP.close();
});

test("establish session", async () => {
	assert(!session.isConnected());
	assert(!lastMessage);

	const messageWithWrongToken = Buffer.concat([
		Buffer.from([0]), session.token.subarray(0, Session.TOKEN_SIZE - 1),
	]);
	await send(messageWithWrongToken);
	assert(!session.isConnected());
	assert.deepEqual(lastMessage, Buffer.from([0, 0])); // error

	const message = Buffer.concat([
		Buffer.from([0]), session.token,
	]);
	await send(message);
	assert(session.isConnected());
	assert.deepEqual(lastMessage, Buffer.from([0])); // acknowledgement
});

test("send message", async () => {
	const testStringToClient = "to client";
	const testNumberToClient = 1234;
	const messageToClient = UDPTestMessage.create({testString: testStringToClient, testNumber: testNumberToClient});
	session.send(messageToClient);
	await setTimeout(10);
	assert.deepEqual(lastMessage, Buffer.concat([
		Buffer.from([1, 0]), Protobuf.encode(messageToClient)
	]));

	const testStringToServer = "to server";
	const testNumberToServer = 4321;
	const messageToServer = Buffer.concat([
		Buffer.from([1, 0]),
		session.token.subarray(0, UDPSocket["TOKEN_PREFIX_SIZE"]),
		Protobuf.encode(UDPTestMessage.create({testString: testStringToServer, testNumber: testNumberToServer}))
	]);
	await send(messageToServer);
	assert.equal(UDPTestService.calledWith.testString, testStringToServer);
	assert.equal(UDPTestService.calledWith.testNumber, testNumberToServer);
});