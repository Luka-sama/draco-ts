import assert from "assert/strict";
import {Vec2i, Vector2i} from "../math/vector.js";
import ClassInfo, {ClassWithInfo} from "../type-analyzer/class-info.js";
import TypeAnalyzer from "../type-analyzer/type-analyzer.js";
import {Double, Float, Int32, Int64, PropertiesOf, UInt32, UInt64} from "../typings.js";
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
	public int32array!: Int32[];
	public enum!: TestEnum;
	public position!: Vector2i;
	public nested!: TestMessageType;
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
	public int32array!: Int32[];
	public enum!: TestEnum;
	public position!: Vector2i;
	public nested!: TestMessageType;
}

let typings: ClassInfo;
let vector2iInfo: ClassInfo;
let testMessageTypeInfo: ClassInfo, testMessageInfo: ClassInfo;
let testServiceInfo: ClassInfo;
beforeAll(() => {
	TypeAnalyzer.init();
	for (const typeInfo of TypeAnalyzer.getAllTypes()) {
		if (!(typeInfo instanceof ClassInfo)) {
			continue;
		}
		if (typeInfo.name == "Typings") {
			typings = typeInfo;
		} else if (typeInfo.name == "Vector2i") {
			vector2iInfo = typeInfo;
		} else if (typeInfo.name == "TestMessageType") {
			testMessageTypeInfo = typeInfo;
		} else if (typeInfo.name == "TestMessage") {
			testMessageInfo = typeInfo;
		} else if (typeInfo.name == "TestService") {
			testServiceInfo = typeInfo;
		}
	}

	const types: ClassWithInfo[] = [[Vector2i, vector2iInfo], [TestMessageType, testMessageTypeInfo]];
	const messages: ClassWithInfo[] = [[TestMessage, testMessageInfo]];
	const services: ClassWithInfo[] = [[TestService, testServiceInfo]];
	Protobuf.init(types, messages, services, 1, typings);
});

test("message encoding & service decoding", () => {
	const loggerWarn = jest.spyOn(Protobuf["logger"], "warn").mockImplementation();
	const nested = TestMessageType.create({someField: ""});
	const data: PropertiesOf<TestMessage> = {
		uint32: 12345, int64: -1234567890n, uint64: BigInt(Date.now()), float: 3.14, double: 3.1415,
		false: false, true: true, string: "hello world", int32array: [1, 22, 333], enum: TestEnum.Second,
		position: Vec2i(10, 15), nested
	};
	const msg = TestMessage.create(data);

	const encodedWithWrongOpcode = Protobuf.encode(msg);
	const failedService = Protobuf.decode(encodedWithWrongOpcode);
	expect(failedService).toBeNull();
	expect(loggerWarn).toBeCalledTimes(1);

	Protobuf["opcodeByClassMap"].set(TestMessage, 255);
	const encoded = Protobuf.encode(msg);
	const service = Protobuf.decode(encoded);
	expect(service).toBeInstanceOf(TestService);
	assert(service instanceof TestService);

	expect(service.int32).toBe(-12345);
	expect(service.uint32).toBe(data.uint32);
	expect(service.int64).toBe(data.int64);
	expect(service.uint64).toBe(data.uint64);
	expect(service.float).toBeCloseTo(data.float);
	expect(service.double).toBeCloseTo(data.double);
	expect(service.false).toBe(data.false);
	expect(service.true).toBe(data.true);
	expect(service.string).toBe(data.string);
	expect(service.int32array).toStrictEqual(data.int32array);
	expect(service.enum).toBe(data.enum);
	expect(service.position).toStrictEqual(data.position);
	expect(service.nested).toStrictEqual(data.nested);
});