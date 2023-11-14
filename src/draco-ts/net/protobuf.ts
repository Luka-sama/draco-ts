import protobuf, {Long} from "protobufjs";
import Logger from "../logger.js";
import ClassInfo from "../type-analyzer/class-info.js";
import TypeAnalyzer from "../type-analyzer/type-analyzer.js";
import {Kind, PropertyInfo, PropertyType} from "../type-analyzer/type-analyzer.typings.js";
import {Class, Constructor, Double, PropertiesOf, Typings} from "../typings.js";
import BaseProtoClass from "./base-proto-class.js";
import Message from "./message.js";
import Service from "./service.js";

/** The info about a protobuf field that will be sent to the user */
interface ProtobufFieldInfo {
	id: number;
	name: string;
	type: string;
}

/** Type of a proto class */
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

/**
 * The child class of Message or Service with the info about this class
 * @internal
 */
export type ProtoClassWithInfo = ({ProtoClass: typeof BaseProtoClass, classInfo: ClassInfo});
/**
 * The arbitrary class used as a protobuf type with the info about this class
 * @internal
 */
export type TypeClassWithInfo = ({TypeClass: Class, classInfo: ClassInfo});

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
	/** A map whose keys are opcodes and values are either messages or services */
	private static readonly classByOpcodeMap = new Map<number, typeof BaseProtoClass>;
	/** A map whose keys are type names and values are protobuf types */
	private static readonly protobufByNameMap = new Map<string, protobuf.Type>;
	/** A map whose keys are type names and values are type classes */
	private static readonly typesByNameMap = new Map<string, Class>;
	/** A map whose keys are type names and values are messages */
	private static readonly messagesByNameMap = new Map<string, typeof Message & Constructor<Message>>;
	/** A map whose keys are type names and values are services */
	private static readonly servicesByNameMap = new Map<string, typeof Service & Constructor<Service>>;
	private static readonly root = new protobuf.Root();

	/** Calls {@link Protobuf.initClasses} for the given messages and services. Remembers the given opcode size */
	public static init(
		types: TypeClassWithInfo[], messages: ProtoClassWithInfo[], services: ProtoClassWithInfo[],
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
		const protobufType = (message.constructor as typeof Message)._protobuf;
		if (!protobufType) {
			Protobuf.logger.error(`The message class ${message?.constructor?.name} was not found or not exported.`);
			return Buffer.alloc(0);
		}

		const opcode = (message.constructor as typeof Message)._opcode;
		const encodedOpcode = Buffer.alloc(Protobuf.opcodeSize);
		encodedOpcode.writeUIntBE(opcode, 0, Protobuf.opcodeSize);
		const dataToEncode = Protobuf.getDataToEncode(protobufType, message);
		if (!dataToEncode) {
			return Buffer.alloc(0);
		}
		const encodedMessage = protobufType.encode(
			protobufType.create(dataToEncode)
		).finish() as Buffer;
		return Buffer.concat([encodedOpcode, encodedMessage]);
	}

	/** Decodes a buffer using the opcode at its beginning. Returns a service with the filled data */
	public static decode(buffer: Buffer): Service | null {
		const opcode = buffer.readUIntBE(0, Protobuf.opcodeSize);
		const encodedMessage = buffer.slice(Protobuf.opcodeSize);
		const ProtoClass = Protobuf.classByOpcodeMap.get(opcode) as typeof Service & Constructor<Service>;
		if (!ProtoClass || !ProtoClass.name.endsWith(Service.name)) {
			Protobuf.logger.warn(`The service with opcode ${opcode} was not found.`);
			return null;
		}
		const protobufType = ProtoClass._protobuf;
		const decodedMessage = protobufType.toObject(
			protobufType.decode(encodedMessage),
			{defaults: true}
		) as PropertiesOf<typeof ProtoClass>;

		const data = Protobuf.getDecodedData(protobufType, decodedMessage);
		if (!data) {
			return null;
		}
		return ProtoClass.create(data);
	}

	/** Initializes all types that can be used in protobufs */
	private static initTypes(types: TypeClassWithInfo[], typings: ClassInfo) {
		for (const {TypeClass, classInfo} of types) {
			const protobufType = Protobuf.transform(classInfo, typings, TypeClass.name);
			if (protobufType) {
				Protobuf.addToJSONInfo(protobufType, 0, ProtoClassType.Type);
				Protobuf.typesByNameMap.set(TypeClass.name, TypeClass);
			}
		}
	}

	/**
	 * Initializes either all messages or all services.
	 * It sets properties {@link BaseProtoClass._opcode} and {@link BaseProtoClass._protobuf}
	 * and prepares {@link Protobuf.typeInfos}.
	 */
	private static initClasses(classes: ProtoClassWithInfo[], BaseClass: Class, typings: ClassInfo): void {
		const isService = (BaseClass == Service);

		const opcodeLimit = 2 ** (Protobuf.opcodeSize * 8) - 1;
		let opcode = (isService ? opcodeLimit : 1);
		if (Protobuf.classByOpcodeMap.has(opcode)) {
			return;
		}
		for (const {ProtoClass, classInfo} of classes) {
			const protobufType = Protobuf.transform(classInfo, typings, BaseClass.name);
			if (!protobufType) {
				continue;
			}

			const type = (isService ? ProtoClassType.Service : ProtoClassType.Message);
			Protobuf.addToJSONInfo(protobufType, opcode, type);
			if (isService) {
				Protobuf.servicesByNameMap.set(classInfo.name, ProtoClass as typeof Service & Constructor<Service>);
			} else {
				Protobuf.messagesByNameMap.set(classInfo.name, ProtoClass as typeof Message & Constructor<Message>);
			}

			ProtoClass._protobuf = protobufType;
			ProtoClass._opcode = opcode;
			Protobuf.classByOpcodeMap.set(opcode, ProtoClass);

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
		for (const property of classInfo.getAllProperties()) {
			const field = Protobuf.propertyToField(property, id, typings);
			if (field) {
				protobufType.add(field);
				id++;
			}
		}
		return protobufType;
	}

	/** Transforms a property info from {@link TypeAnalyzer} to a protobuf field. Returns `null` in case of failure */
	private static propertyToField(property: PropertyInfo, id: number, typings: ClassInfo): protobuf.Field | null {
		if (property.static) {
			return null;
		}
		if (property.type.kind == Kind.Array) {
			const type = Protobuf.transformType(property.type.subtypes[0], typings);
			return (type ? new protobuf.Field(property.name, id, type, "repeated") : null);
		}
		const type = Protobuf.transformType(property.type, typings);
		return (type ? new protobuf.Field(property.name, id, type) : null);
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
			const enumInfo = TypeAnalyzer.getByFullName(type.fullName);
			if (enumInfo.properties.some(property => {
				const number = +property.type.name;
				return (
					property.type.kind != Kind.Number || isNaN(number) ||
					number < Typings.UINT32_MIN_VALUE || number > Typings.UINT32_MAX_VALUE
				);
			})) {
				Protobuf.logger.error("Only enums with uint32 values are allowed.");
				return null;
			}
			return "uint32";
		} else if (type.kind == Kind.Class) {
			const classInfo = TypeAnalyzer.getByFullName(type.fullName);
			return classInfo.name;
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
			if (!Protobuf.validate(value, field.type, field.repeated, field.name, protobufType.name)) {
				return null;
			}
			data[field.name] = value;

			const protobufSubtype = Protobuf.protobufByNameMap.get(field.type);
			if (protobufSubtype) {
				data[field.name] = Protobuf.getDataToEncode(protobufSubtype, value);
			} else if (typeof value == "bigint") {
				data[field.name] = value.toString();
			}
		}

		return data;
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
			data[field.name] = value;

			const protobufSubtype = Protobuf.protobufByNameMap.get(field.type);
			if (protobufSubtype && value) {
				const TypeClass = Protobuf.typesByNameMap.get(field.type);
				const MessageClass = Protobuf.messagesByNameMap.get(field.type);
				const ServiceClass = Protobuf.servicesByNameMap.get(field.type);
				const decoded = Protobuf.getDecodedData(protobufSubtype, value);
				if (!decoded) {
					data[field.name] = null;
				} else if (MessageClass) {
					data[field.name] = MessageClass.create(decoded);
				} else if (ServiceClass) {
					data[field.name] = ServiceClass.create(decoded);
				} else if (TypeClass) {
					const object = Object.create(TypeClass.prototype);
					Object.assign(object, decoded);
					data[field.name] = object;
				} else {
					data[field.name] = decoded;
				}
			} else if (value instanceof protobuf.util.Long) {
				data[field.name] = Protobuf.longToBigint(value);
			}
		}
		return data;
	}

	/** Converts an object with long number (i.e. int64) to bigint */
	private static longToBigint(long: Long): bigint {
		const high = (long.unsigned ? (long.high >>> 0) : long.high);
		const low = long.low >>> 0;
		return (BigInt(high) << 32n) + BigInt(low);
	}

	/** Validates a value that should be encoded. Ensures that numbers are not out of range */
	private static validate(
		value: unknown, type: string, repeated: boolean, fieldName: string, typeName: string
	): boolean {
		const name = `${typeName}.${fieldName}`;
		if (value === undefined) {
			Protobuf.logger.error(`${name} was not set.`);
			return false;
		} else if (repeated) {
			if (value instanceof Array) {
				return value.every(entry => Protobuf.validate(entry, type, false, fieldName, typeName));
			} else {
				Protobuf.logger.error(`${name} is not an array (value=${value}).`);
				return false;
			}
		} else if (type.endsWith("int32")) {
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
		} else if (type.endsWith("int64")) {
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
		}
		return true;
	}
}