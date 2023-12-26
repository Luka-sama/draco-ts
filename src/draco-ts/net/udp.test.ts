import assert from "assert/strict";
import dgram from "dgram";
import {after, before, beforeEach, mock, test} from "node:test";
import GameLoop from "../game-loop/game-loop.js";
import {LogLevel} from "../logger.js";
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
	public static calledWith = {testString: "", testNumber: 0, testNumbers: new Array<number>};
	public testString!: string;
	public testNumber!: UInt32;

	public run({testString, testNumber}: this): void {
		UDPTestService.calledWith.testString = testString;
		UDPTestService.calledWith.testNumber = testNumber;
		UDPTestService.calledWith.testNumbers.push(testNumber);
	}
}

const clientMessages: Buffer[] = [];
let send: (message: Buffer) => Promise<void>;
let session: Session;
let tokenPrefix: Buffer;

let _resolve: () => void;
function waitForAnswer(): Promise<void> {
	return new Promise(resolve => {
		_resolve = resolve;
	});
}
async function sendAndWaitForAnswer(message: Buffer): Promise<void> {
	await send(message);
	await waitForAnswer();
}

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

	mock.timers.enable();
	GameLoop.init(16);

	Session.waitForReconnection = 5000;
	UDP.maxOptimalPacketCount = 3;
	UDP.attemptCount = 5;
	UDP.sessionTimeout = 5000;
	UDP.receiveMaxBytesPerSecond = 65535;
	UDP.shouldWaitForNext = 1000;
	UDP.init();
	const address = "127.0.0.1";
	const port = +process.env.UDP_PORT!;
	const client = dgram.createSocket({type: "udp4", sendBufferSize: 1024 ** 3, recvBufferSize: 1024 ** 3});
	client.on("message", message => {
		clientMessages.push(message);
		_resolve?.();
	});
	client.unref();
	session = await Session.create();
	tokenPrefix = session.token.subarray(0, UDPSocket["TOKEN_PREFIX_SIZE"]);
	send = async (message): Promise<void> => {
		client.send(message, 0, message.length, port, address);
		await UDP.waitForMessage();
	};
	UDP.logger.setLevel(LogLevel.Debug);
});

after(() => {
	UDP.close();
	GameLoop.stop();
});

beforeEach(() => {
	clientMessages.length = 0;
	UDPTestService.calledWith.testString = "";
	UDPTestService.calledWith.testNumber = 0;
	UDPTestService.calledWith.testNumbers.length = 0;
});

test("establish session", async () => {
	assert(!session.isConnected());
	assert.deepEqual(clientMessages, []);

	const messageWithWrongToken = Buffer.concat([
		Buffer.from([0]), session.token.subarray(0, Session["TOKEN_SIZE"] - 1),
	]);
	UDP.logger.setLevel(LogLevel.Warn);
	await sendAndWaitForAnswer(messageWithWrongToken);
	UDP.logger.setLevel(LogLevel.Debug);
	assert(!session.isConnected());
	assert.deepEqual(clientMessages[0], Buffer.from([0, 0])); // Error

	const message = Buffer.concat([
		Buffer.from([0]), session.token,
	]);
	await sendAndWaitForAnswer(message);
	assert(session.isConnected());
	assert.deepEqual(clientMessages[1], Buffer.from([0])); // Acknowledgement
});

test("simple message to client", async () => {
	const message = UDPTestMessage.create({testString: "to client", testNumber: 1234});
	session.send(message);
	await waitForAnswer();
	assert.deepEqual(clientMessages[0], Buffer.concat([
		Buffer.from([1, 0]), Protobuf.encode(message)
	]));
	await send(Buffer.concat([Buffer.from([1, 0]), tokenPrefix])); // Acknowledgement
});

test("simple message to server", async () => {
	const testString = "to server";
	const testNumber = 4321;
	const message = UDPTestMessage.create({testString, testNumber});
	const buffer = Buffer.concat([
		Buffer.from([1, 0]), tokenPrefix, Protobuf.encode(message)
	]);
	await sendAndWaitForAnswer(buffer);
	assert.equal(UDPTestService.calledWith.testString, testString);
	assert.equal(UDPTestService.calledWith.testNumber, testNumber);
	assert.deepEqual(clientMessages[0], Buffer.from([1])); // Acknowledgement
});

test("big message to client", async () => {
	const message = UDPTestMessage.create({testString: "a".repeat(2 * UDP.MAX_SAFE_PACKET_SIZE), testNumber: 7});
	const buffer = Protobuf.encode(message);
	session.send(message);
	const indexes = [
		0,
		UDP.MAX_SAFE_PACKET_SIZE - 3,
		(UDP.MAX_SAFE_PACKET_SIZE - 3) + (UDP.MAX_SAFE_PACKET_SIZE - 2),
	];
	for (let i = 0; i < indexes.length; i++) {
		await waitForAnswer();
	}
	assert.deepEqual(clientMessages, [
		Buffer.concat([Buffer.from([2, 1, 3]), buffer.subarray(indexes[0], indexes[1])]),
		Buffer.concat([Buffer.from([3, 2]), buffer.subarray(indexes[1], indexes[2])]),
		Buffer.concat([Buffer.from([4, 3]), buffer.subarray(indexes[2])])
	]);
	for (let i = 0; i < indexes.length; i++) {
		await send(Buffer.concat([Buffer.from([2 + i, 0]), tokenPrefix])); // Acknowledgement
	}
});

test("big message to server", async () => {
	const testString = "s".repeat(2 * UDP.MAX_SAFE_PACKET_SIZE);
	const testNumber = 4321;
	const buffer = Protobuf.encode(UDPTestMessage.create({testString, testNumber}));
	const contentSize = UDP.MAX_SAFE_PACKET_SIZE - 2 - tokenPrefix.length;
	const indexes = [
		0,
		contentSize - 1,
		(contentSize - 1) + contentSize
	];
	const messagesToServer = [
		Buffer.concat([Buffer.from([3, 2]), tokenPrefix, buffer.subarray(indexes[1], indexes[2])]),
		Buffer.concat([Buffer.from([2, 1, 3]), tokenPrefix, buffer.subarray(indexes[0], indexes[1])]),
		Buffer.concat([Buffer.from([4, 3]), tokenPrefix, buffer.subarray(indexes[2])]),
	];
	for (const messageToServer of messagesToServer) {
		assert.equal(UDPTestService.calledWith.testString, "");
		assert.equal(UDPTestService.calledWith.testNumber, 0);
		await sendAndWaitForAnswer(messageToServer);
	}
	assert.equal(UDPTestService.calledWith.testString, testString);
	assert.equal(UDPTestService.calledWith.testNumber, testNumber);
	assert.deepEqual(clientMessages, [
		Buffer.from([3]), Buffer.from([2]), Buffer.from([4])
	]); // Acknowledgements
});

test("resending message to client", async () => {
	const message = UDPTestMessage.create({testString: "some string", testNumber: 999});
	const buffer = Buffer.concat([
		Buffer.from([5, 0]), Protobuf.encode(message)
	]);

	session.send(message);
	await waitForAnswer();
	assert.deepEqual(clientMessages, [buffer]);
	// No acknowledgement

	mock.timers.tick(50);
	await waitForAnswer();
	assert.deepEqual(clientMessages, [buffer, buffer]);
	await send(Buffer.concat([Buffer.from([5, 0]), tokenPrefix])); // Acknowledgement
	mock.timers.tick(2000);
});

test("very big message to client", async () => {
	const packetCount = UDPSocket["MAX_MESSAGE_ID"];
	const packetSize = UDP.MAX_SAFE_PACKET_SIZE - UDPSocket.SENT_HEADER_SIZE;
	const testString = "a".repeat((packetCount - 1) * packetSize);
	const message = UDPTestMessage.create({testString, testNumber: 7});
	session.send(message);
	for (let i = 0; i < packetCount; i++) {
		await waitForAnswer();
	}
	assert.deepEqual(clientMessages[0].subarray(0, 3), Buffer.from([6, 1, packetCount]));
	assert.deepEqual(clientMessages[1].subarray(0, 2), Buffer.from([7, 2]));
	assert.deepEqual(clientMessages[clientMessages.length - 1].subarray(0, 2), Buffer.from([5, packetCount]));

	for (let i = 1; i <= packetCount; i++) {
		await send(Buffer.concat([Buffer.from([i, 0]), tokenPrefix])); // Acknowledgement
	}
});

test("session reconnection", async () => {
	session["udpSocket"]!.close(false);
	assert(!session.isConnected());
	assert.deepEqual(clientMessages, []);

	const message = UDPTestMessage.create({testString: "my string", testNumber: 55});
	const buffer = Protobuf.encode(message);

	UDP.logger.setLevel(LogLevel.Warn);
	await sendAndWaitForAnswer(Buffer.concat([Buffer.from([6, 0]), tokenPrefix, buffer]));
	UDP.logger.setLevel(LogLevel.Debug);
	assert(!session.isConnected());
	assert.deepEqual(clientMessages[0], Buffer.from([0, 0])); // Error

	await sendAndWaitForAnswer(Buffer.concat([Buffer.from([0]), session.token]));
	assert.deepEqual(clientMessages[1], Buffer.from([0])); // Acknowledgement
	assert(session.isConnected());

	await sendAndWaitForAnswer(Buffer.concat([Buffer.from([1, 0]), tokenPrefix, buffer]));
	assert.deepEqual(clientMessages[2], Buffer.from([1])); // Acknowledgement
});

test("correct order", async () => {
	const testString = "to server";
	const numbers = [0, 10, 20, 30, 40];
	const order = [2, 1, 0, 4, 3];
	const encodedMessages = numbers
		.map(testNumber => Protobuf.encode(UDPTestMessage.create({testString, testNumber})));
	const buffers1 = encodedMessages.map((message, i) => Buffer.concat([
		Buffer.from([2 + i, 0]), tokenPrefix, message
	]));
	const buffers2 = encodedMessages.map((message, i) => Buffer.concat([
		Buffer.from([7 + i, 0]), tokenPrefix, message
	]));

	for (const index of order) {
		await sendAndWaitForAnswer(buffers1[index]);
	}
	assert.deepEqual(UDPTestService.calledWith.testNumbers, numbers.map((_number, i) => numbers[order[i]]));
	assert.deepEqual(clientMessages, order.map(index => Buffer.from([2 + index]))); // Acknowledgement

	UDPTestService.options.correctOrder = true;
	UDPTestService.calledWith.testNumbers.length = 0;
	clientMessages.length = 0;
	for (const index of order) {
		await sendAndWaitForAnswer(buffers2[index]);
	}
	assert.deepEqual(UDPTestService.calledWith.testNumbers, numbers);
	assert.deepEqual(clientMessages, order.map(index => Buffer.from([7 + index]))); // Acknowledgement
	UDPTestService.options.correctOrder = false;
});