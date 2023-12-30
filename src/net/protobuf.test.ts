import assert from "assert/strict";
import _ from "lodash";
import {before, test} from "node:test";
import {Double, Float, Int32, Int64, PropertiesOf, Typings, UInt32, UInt64} from "../core/typings.js";
import {Vec2i, Vector2i} from "../math/vector.js";
import {ClassWithInfo} from "../type-analyzer/class-info.js";
import ClassLoader from "../type-analyzer/class-loader.js";
import TypeAnalyzer from "../type-analyzer/type-analyzer.js";
import MessageType from "./message-type.js";
import Message from "./message.js";
import Protobuf from "./protobuf.js";
import Service from "./service.js";

enum TestEnum {
	First,
	Second,
	Third,
}

export class TestMessageType extends MessageType {
	public someField!: string;
}

export class TestMessage extends Message {
	public int32?: Int32 = -12345;
	public uint32!: UInt32;
	public int64!: Int64;
	public uint64!: UInt64;
	public float!: Float;
	public double!: Double;
	public false!: boolean;
	public true!: boolean;
	public string!: string;
	public int64array!: Int64[];
	public enum!: TestEnum;
	public position!: Vector2i;
	public nested!: TestMessageType;
	public optionalInt64?: Int64;
	public optionalBoolean?: boolean;
	public optionalString?: string;
	public optionalArray?: Int32[];
	public optionalEnum?: TestEnum;
	public optionalPosition?: Vector2i;
	public optionalNested?: TestMessageType;
}

export class TestService extends Service {
	public int32!: Int32;
	public uint32!: UInt32;
	public int64!: Int64;
	public uint64!: UInt64;
	public float!: Float;
	public double!: Double;
	public false!: boolean;
	public true!: boolean;
	public string!: string;
	public int64array!: Int64[];
	public enum!: TestEnum;
	public position!: Vector2i;
	public nested!: TestMessageType;
	public optionalInt64!: Int64;
	public optionalBoolean!: boolean;
	public optionalString!: string;
	public optionalArray!: Int32[];
	public optionalEnum!: TestEnum;
	public optionalPosition!: Vector2i;
	public optionalNested?: TestMessageType;
}

before(async () => {
	TypeAnalyzer.init(["**/net/*.d.ts", "**/typings.d.ts", "**/vector.d.ts"]);

	const types: ClassWithInfo[] = [
		await ClassLoader.findOrThrowWithInfo(Vector2i),
		await ClassLoader.findOrThrowWithInfo(TestMessageType)
	];
	const messages: ClassWithInfo[] = [
		await ClassLoader.findOrThrowWithInfo(TestMessage),
	];
	const services: ClassWithInfo[] = [
		await ClassLoader.findOrThrowWithInfo(TestService),
	];
	const typings = await ClassLoader.findOrThrow(Typings);
	Protobuf.init(types, messages, services, 1, typings);
});

test("message encoding & service decoding", ctx => {
	const loggerWarn = ctx.mock.method(Protobuf["logger"], "warn");
	loggerWarn.mock.mockImplementationOnce(() => {});
	const nested = TestMessageType.create({someField: "lalala"});
	const data: PropertiesOf<TestMessage> = {
		uint32: 12345, int64: -9_223_372_036_854_775_800n, uint64: BigInt(Date.now()), float: 3.14, double: 3.1415,
		false: false, true: true, string: "hello world", int64array: [1n, 22n, 333n], enum: TestEnum.Second,
		position: Vec2i(10, 15), nested
	};
	const msg = TestMessage.create(data);

	const encodedWithWrongOpcode = Protobuf.encode(msg);
	const failedService = Protobuf.decode(encodedWithWrongOpcode);
	assert.equal(failedService, null);
	assert.equal(loggerWarn.mock.callCount(), 1);

	Protobuf["opcodeByClassMap"].set(TestMessage, 255);
	const encoded = Protobuf.encode(msg);
	const service = Protobuf.decode(encoded);
	assert(service instanceof TestService);

	assert.equal(service.int32, -12345);
	assert.equal(service.uint32, data.uint32);
	assert.equal(service.int64, data.int64);
	assert.equal(service.uint64, data.uint64);
	assert.equal(_.round(service.float, 5), data.float);
	assert.equal(_.round(service.double, 5), data.double);
	assert.equal(service.false, data.false);
	assert.equal(service.true, data.true);
	assert.equal(service.string, data.string);
	assert.deepEqual(service.int64array, data.int64array);
	assert.equal(service.enum, data.enum);
	assert.deepEqual(service.position, data.position);
	assert.deepEqual(service.nested, data.nested);
	assert.equal(service.optionalInt64, 0n);
	assert.equal(service.optionalBoolean, false);
	assert.equal(service.optionalString, "");
	assert.deepEqual(service.optionalArray, []);
	assert.equal(service.optionalEnum, TestEnum.First);
	assert.deepEqual(service.optionalPosition, Vector2i.Zero);
	assert.equal(service.optionalNested, undefined);
});