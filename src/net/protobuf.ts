import protobuf from "protobufjs/light.js";
import Logger from "../core/logger.js";
import {Class, Constructor, PropertiesOf, Typings} from "../core/typings.js";
import {Vector2f, Vector2i, Vector3f, Vector3i} from "../math/vector.js";
import ClassInfo, {ClassWithInfo} from "../type-analyzer/class-info.js";
import TypeAnalyzer from "../type-analyzer/type-analyzer.js";
import {Kind, PropertyType} from "../type-analyzer/type-analyzer.typings.js";
import BaseProtoClass from "./base-proto-class.js";
import Message from "./message.js";
import Service from "./service.js";

/** The info about a protobuf field that will be sent to the user */
interface ProtobufFieldInfo {
	id: number;
	name: string;
	type: string;
}

/** Type of proto class */
enum ProtoClassType {
	/** A message can be sent to a user */
	Message,
	/** A service is a message received from a user */
	Service,
	/** A type cannot be sent by itself alone, but can be used in messages and services */
	Type,
}

/** The info about a protobuf type that will be sent to the user */
interface ProtobufTypeInfo {
	name: string;
	opcode: number;
	type: ProtoClassType;
	fields: ProtobufFieldInfo[];
}

/** This class handles encoding and decoding of binary data using protobufs */
export default class Protobuf {
	/**
	 * This info will be sent as JSON to users when they are connected,
	 * so that the opcodes and the property ids are synchronized between the client and the server.
	 */
	public static readonly typeInfos: ProtobufTypeInfo[] = [];
	private static readonly logger = new Logger(Protobuf);
	/** See {@link AppConfig.opcodeSize} */
	private static opcodeSize = 0;
	/** A map whose keys are opcodes and values are proto classes */
	private static readonly classByOpcodeMap = new Map<number, typeof BaseProtoClass>;
	/** A map whose keys are proto classes and values are opcodes */
	private static readonly opcodeByClassMap = new Map<typeof BaseProtoClass, number>;
	/** A map whose keys are class names and values are protobuf types */
	private static readonly protobufByNameMap = new Map<string, protobuf.Type>;
	/** A map whose keys are class names and values are proto classes */
	private static readonly classesByNameMap = new Map<string, Class>;
	private static readonly root = new protobuf.Root();

	/** Calls {@link Protobuf.initClasses} for the given messages and services. Remembers the given opcode size */
	public static init(
		types: ClassWithInfo[], messages: ClassWithInfo[], services: ClassWithInfo[],
		opcodeSize: number, typings: ClassInfo
	): void {
		Protobuf.opcodeSize = opcodeSize;
		Protobuf.initTypes(types, typings);
		Protobuf.initClasses(messages, Message, typings);
		Protobuf.initClasses(services, Service, typings);
	}

	/**
	 * Encodes the given message as a buffer with opcode so that it can be then sent to the user.
	 * Returns an empty buffer in case of failure
	 */
	public static encode(message: Message): Buffer {
		const protobufType = Protobuf.protobufByNameMap.get(message.constructor.name);
		if (!protobufType) {
			Protobuf.logger.error(`The message class ${message?.constructor?.name} was not found or not exported.`);
			return Buffer.alloc(0);
		}

		const opcode = Protobuf.opcodeByClassMap.get(message.constructor as typeof Message);
		if (!opcode) {
			Protobuf.logger.error(`The opcode for the message class ${message?.constructor?.name} was not found.`);
			return Buffer.alloc(0);
		}
		const encodedOpcode = Buffer.alloc(Protobuf.opcodeSize);
		encodedOpcode.writeUIntBE(opcode, 0, Protobuf.opcodeSize);
		const dataToEncode = Protobuf.getDataToEncode(protobufType, message);
		if (!dataToEncode) {
			return Buffer.alloc(0);
		}
		const encodedMessage = (protobufType.encode(
			protobufType.create(dataToEncode)
		) as {finish: () => Uint8Array}).finish() as Buffer;
		return Buffer.concat([encodedOpcode, encodedMessage]);
	}

	/** Decodes a buffer using the opcode at its beginning. Returns a service with the filled data */
	public static decode(buffer: Buffer): Service | null {
		const opcode = buffer.readUIntBE(0, Protobuf.opcodeSize);
		const encodedMessage = buffer.subarray(Protobuf.opcodeSize);
		const ProtoClass = Protobuf.classByOpcodeMap.get(opcode) as typeof Service & Constructor<Service>;
		if (!ProtoClass || !ProtoClass.name.endsWith(Service.name)) {
			Protobuf.logger.warn(`The service with opcode ${opcode} was not found.`);
			return null;
		}
		const protobufType = Protobuf.protobufByNameMap.get(ProtoClass.name);
		if (!protobufType) {
			Protobuf.logger.error(
				`The corresponding protobuf type for the service class ${ProtoClass.name} was not found.`
			);
			return null;
		}
		try {
			const decodedMessage = protobufType.toObject(
				protobufType.decode(encodedMessage),
				{defaults: true}
			) as PropertiesOf<typeof ProtoClass>;
			const data = Protobuf.getDecodedData(protobufType, decodedMessage);
			if (!data) {
				return null;
			}
			return ProtoClass.create(data);
		} catch (e) {
			Protobuf.logger.error(`Failed decoding of ${ProtoClass.name}. ${e}`);
			return null;
		}
	}

	/** Initializes all types that can be used in protobufs */
	private static initTypes(types: ClassWithInfo[], typings: ClassInfo): void {
		for (const [TypeClass, classInfo] of types) {
			const protobufType = Protobuf.transform(classInfo, typings, TypeClass.name);
			if (protobufType) {
				Protobuf.addToJSONInfo(protobufType, 0, ProtoClassType.Type);
				Protobuf.classesByNameMap.set(TypeClass.name, TypeClass);
			}
		}
	}

	/**
	 * Initializes either all messages or all services.
	 * It sets opcode, saves info in Protobuf maps and prepares {@link Protobuf.typeInfos}
	 */
	private static initClasses(classes: ClassWithInfo[], BaseClass: Class, typings: ClassInfo): void {
		const isService = (BaseClass == Service);

		const opcodeLimit = 2 ** (Protobuf.opcodeSize * 8) - 1;
		let opcode = (isService ? opcodeLimit : 1);
		if (Protobuf.classByOpcodeMap.has(opcode)) {
			return;
		}
		for (const [ProtoClass, classInfo] of classes) {
			const protobufType = Protobuf.transform(classInfo, typings, BaseClass.name);
			if (!protobufType) {
				continue;
			}

			const type = (isService ? ProtoClassType.Service : ProtoClassType.Message);
			Protobuf.addToJSONInfo(protobufType, opcode, type);
			Protobuf.classesByNameMap.set(classInfo.name, ProtoClass);

			Protobuf.classByOpcodeMap.set(opcode, ProtoClass as typeof BaseProtoClass);
			Protobuf.opcodeByClassMap.set(ProtoClass as typeof BaseProtoClass, opcode);

			opcode += (isService ? -1 : 1);
			if (opcode > opcodeLimit || Protobuf.classByOpcodeMap.has(opcode)) {
				Protobuf.logger.error(`Too many message and service classes: limit of ${opcodeLimit} reached.`);
				return;
			}
		}
	}

	/** Returns info about a protobuf type as an object that can be send as JSON */
	private static addToJSONInfo(protobufType: protobuf.Type, opcode: number, type: ProtoClassType): void {
		const name = protobufType.name;
		const fields: ProtobufFieldInfo[] = [];
		for (const {id, name, type} of protobufType.fieldsArray) {
			fields.push({id, name, type});
		}
		Protobuf.typeInfos.push({name, opcode, type, fields});
	}

	/**
	 * Transforms a class info from {@link TypeAnalyzer} (message or service) to a protobuf type.
	 * Returns `null` in case of failure
	 */
	private static transform(
		classInfo: ClassInfo, typings: ClassInfo, nameShouldEndWith = ""
	): protobuf.Type | null {
		const name = classInfo.name;
		if (!classInfo.exported) {
			Protobuf.logger.warn(
				`The class ${name} is not exported, so it was skipped.`
			);
			return null;
		} else if (!name.endsWith(nameShouldEndWith)) {
			Protobuf.logger.warn(
				`The class ${name} was skipped as the message name must end with "${nameShouldEndWith}".`
			);
			return null;
		}

		const protobufType = new protobuf.Type(name);
		Protobuf.root.add(protobufType);
		Protobuf.protobufByNameMap.set(name, protobufType);
		let id = 1;
		const enums = new Set<string>;
		for (const property of classInfo.getAllProperties()) {
			if (property.static) {
				continue;
			}

			const field = Protobuf.propertyToField(property.name, property.type, id, typings);
			if (!field) {
				continue;
			}

			if (property.type.kind != Kind.Enum || enums.has(property.type.name)) {
				protobufType.add(field);
				id++;
				continue;
			}

			const enumInfo = TypeAnalyzer.getByFullName(property.type.fullName);
			const values: {[key: string]: number} = {};
			enumInfo.properties.forEach(p => values[p.name] = +p.type.name);
			const indexes = Object.values(values);
			if (
				enumInfo.properties.some(property => property.type.kind != Kind.Number) ||
				indexes.some(num => isNaN(num) || num < Typings.UINT32_MIN_VALUE || num > Typings.UINT32_MAX_VALUE) ||
				indexes.every(num => num != 0)
			) {
				Protobuf.logger.error("Only enums with uint32 values starting from 0 are allowed.");
				continue;
			}

			const enumType = new protobuf.Enum(enumInfo.name, values);
			enums.add(property.type.name);
			protobufType.add(enumType);
			protobufType.add(field);
			id++;
		}
		return protobufType;
	}

	/** Transforms a property info from {@link TypeAnalyzer} to a protobuf field. Returns `null` in case of failure */
	private static propertyToField(
		propertyName: string, propertyType: PropertyType, id: number, typings: ClassInfo, repeated = false
	): protobuf.Field | null {
		if (propertyType.kind == Kind.Array) {
			return Protobuf.propertyToField(propertyName, propertyType.subtypes[0], id, typings, true);
		}
		const type = Protobuf.transformType(propertyType, typings);
		return (type ? new protobuf.Field(propertyName, id, type, (repeated ? "repeated" : undefined)) : null);
	}

	/** Transforms a type info from {@link TypeAnalyzer} to a protobuf field type. Returns `null` in case of failure */
	private static transformType(type: PropertyType, typings: ClassInfo): string | null {
		if (typings.getFromFile("Int32").equals(type)) {
			return "int32";
		} else if (typings.getFromFile("UInt32").equals(type)) {
			return "uint32";
		} else if (typings.getFromFile("Int64").equals(type)) {
			return "int64";
		} else if (typings.getFromFile("UInt64").equals(type)) {
			return "uint64";
		} else if (typings.getFromFile("Float").equals(type)) {
			return "float";
		} else if (typings.getFromFile("Double").equals(type)) {
			return "double";
		} else if ([Kind.Number, Kind.BigInt].includes(type.kind)) {
			const kind = type.kind.toLowerCase();
			Protobuf.logger.error(
				`You should use typings from typings.ts (such as Float or Int32) instead of imprecise "${kind}".`
			);
			return null;
		} else if (type.kind == Kind.Boolean) {
			return "bool";
		} else if (type.kind == Kind.String) {
			return "string";
		} else if (type.kind == Kind.Enum) {
			return type.name;
		} else if (type.kind == Kind.Class) {
			return type.name;
		}
		Protobuf.logger.error(`Unknown field type "${type.kind}".`);
		return null;
	}

	/** Returns a plain object with the data from a message or a type */
	private static getDataToEncode<T extends Class>(
		protobufType: protobuf.Type, message: InstanceType<T>
	): {[key: string]: unknown} | null {
		const data: {[p: string]: unknown} = {};
		for (const field of protobufType.fieldsArray) {
			const value: unknown = message[field.name as keyof typeof message];
			if (!Protobuf.validateValueToEncode(protobufType, field, value)) {
				return null;
			}
			data[field.name] = Protobuf.getValueToEncode(protobufType, field, value);
		}

		return data;
	}

	/** Validates a value that should be encoded. Ensures that numbers are not out of range */
	private static validateValueToEncode(
		protobufType: protobuf.Type, field: protobuf.Field, value: unknown, isArrayElement = false
	): boolean {
		const type = field.type;
		const name = `${protobufType.name}.${field.name}`;
		if (value === undefined) {
			return true;
		} else if (field.repeated && !isArrayElement) {
			if (value instanceof Array) {
				return value.every(
					entry => Protobuf.validateValueToEncode(protobufType, field, entry, true)
				);
			} else {
				Protobuf.logger.error(`${name} is not an array (value=${value}).`);
				return false;
			}
		} else if (["int32", "uint32"].includes(type)) {
			if (typeof value == "number" && Number.isInteger(value)) {
				if (
					type == "int32" && (value < Typings.INT32_MIN_VALUE || value > Typings.INT32_MAX_VALUE) ||
					type == "uint32" && (value < Typings.UINT32_MIN_VALUE || value > Typings.UINT32_MAX_VALUE)
				) {
					Protobuf.logger.error(`${name}: ${type} out of range (value=${value}).`);
					return false;
				}
			} else {
				Protobuf.logger.error(`${name} is not an integer (${value}).`);
				return false;
			}
		} else if (["int64", "uint64"].includes(type)) {
			if (typeof value == "bigint") {
				if (
					type == "int64" && (value < Typings.INT64_MIN_VALUE || value > Typings.INT64_MAX_VALUE) ||
					type == "uint64" && (value < Typings.UINT64_MIN_VALUE || value > Typings.UINT64_MAX_VALUE)
				) {
					Protobuf.logger.error(`${name}: ${type} out of range (value=${value}).`);
					return false;
				}
			} else {
				Protobuf.logger.error(`${name} is not a bigint (${value}).`);
				return false;
			}
		} else if (!Protobuf.validateEnum(protobufType, field, value)) {
			Protobuf.logger.error(`${name}: ${type} out of range (value=${value}).`);
			return false;
		}
		return true;
	}

	/** Transforms a value so that it can be encoded by protobufjs */
	private static getValueToEncode(
		protobufType: protobuf.Type, field: protobuf.Field, value: unknown, isArrayElement = false
	): unknown {
		if (value === undefined) {
			return value;
		}

		if (field.repeated && !isArrayElement) {
			if (value instanceof Array) {
				return value.map(entry => Protobuf.getValueToEncode(protobufType, field, entry, true));
			} else {
				Protobuf.logger.error(`${protobufType.name}.${field.name} is not an array (value=${value}).`);
				return [];
			}
		}

		const protobufSubtype = Protobuf.protobufByNameMap.get(field.type);
		if (protobufSubtype && value) {
			return Protobuf.getDataToEncode(protobufSubtype, value);
		} else if (typeof value == "bigint") {
			return value.toString();
		}
		return value;
	}

	/** Returns a plain object with the transformed data from a message */
	private static getDecodedData(
		protobufType: protobuf.Type, decodedMessage: object
	): {[key: string]: unknown} | null {
		const data: {[key: string]: unknown} = {};
		for (const field of protobufType.fieldsArray) {
			const value: unknown = decodedMessage[field.name as keyof typeof decodedMessage];
			if (value === undefined) {
				Protobuf.logger.warn(`${protobufType.name}.${field.name} was not set.`);
				return null;
			}
			data[field.name] = Protobuf.getDecodedValue(protobufType, field, value);
		}
		return data;
	}

	/** Transforms a decoded value, e.g. from protobuf message to original class message */
	private static getDecodedValue(
		protobufType: protobuf.Type, field: protobuf.Field, value: unknown, isArrayElement = false
	): unknown {
		const name = `${protobufType.name}.${field.name}`;
		if (value === null) {
			value = undefined;
		}

		if (field.repeated && !isArrayElement) {
			if (value instanceof Array) {
				return value.map(entry => Protobuf.getDecodedValue(protobufType, field, entry, true));
			} else {
				Protobuf.logger.error(`${name} is not an array (value=${value}).`);
				return [];
			}
		}

		const protobufSubtype = Protobuf.protobufByNameMap.get(field.type);
		if (protobufSubtype && value) {
			const ProtoClass = Protobuf.classesByNameMap.get(field.type);
			const decoded = Protobuf.getDecodedData(protobufSubtype, value);
			if (!decoded) {
				return null;
			} else if (ProtoClass && BaseProtoClass.isPrototypeOf(ProtoClass)) {
				return (
					ProtoClass as typeof BaseProtoClass & Constructor<BaseProtoClass>
				).create(decoded);
			} else if (ProtoClass) {
				const object = Object.create(ProtoClass.prototype);
				Object.assign(object, decoded);
				return object;
			} else {
				return decoded;
			}
		} else if (protobufSubtype && !value) {
			const ProtoClass = Protobuf.classesByNameMap.get(field.type);
			if (ProtoClass && ([Vector2f, Vector2i, Vector3f, Vector3i] as Class[]).includes(ProtoClass)) {
				return (
					ProtoClass as typeof Vector2f | typeof Vector2i | typeof Vector3f | typeof Vector3i
				).Zero;
			}
		} else if (value instanceof protobuf.util.Long) {
			const high = (value.unsigned ? (value.high >>> 0) : value.high);
			const low = value.low >>> 0;
			return (BigInt(high) << 32n) + BigInt(low);
		} else if (!Protobuf.validateEnum(protobufType, field, value)) {
			Protobuf.logger.warn(`${name}: ${field.type} out of range (value=${value}).`);
			return 0;
		}
		return value;
	}

	/** Validates the given value for the given field of the given protobuf type, if it is an enum */
	private static validateEnum(protobufType: protobuf.Type, field: protobuf.Field, value: unknown): boolean {
		const builtInTypes = ["int32", "uint32", "int64", "uint64", "float", "double", "bool", "string"];
		if (builtInTypes.includes(field.type)) {
			return true;
		}
		const enumType = protobufType.lookup(field.type, protobuf.Enum, true) as protobuf.Enum | null;
		if (!enumType) {
			return true;
		}
		const indexes = Object.values(enumType.values);
		return (typeof value == "number" && indexes.includes(value));
	}
}