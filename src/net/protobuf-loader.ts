import {Class} from "../core/typings.js";
import {Vector2f, Vector2i, Vector3f, Vector3i} from "../math/vector.js";
import {ClassWithInfo} from "../type-analyzer/class-info.js";
import ClassLoader from "../type-analyzer/class-loader.js";
import MessageType from "./message-type.js";
import Message from "./message.js";
import Service from "./service.js";

/** This class prepares all necessary data for {@link Protobuf} */
export default class ProtobufLoader {
	/** Loads all classes that {@link Protobuf} need */
	public static async loadAllProtoClasses(): Promise<{
		types: ClassWithInfo[], messages: ClassWithInfo[]; services: ClassWithInfo[]
	}> {
		const types = (await ProtobufLoader.loadClasses([
			Vector2f, Vector2i, Vector3f, Vector3i,
		])).concat(
			await ProtobufLoader.loadDerivedClassesOf(MessageType)
		);
		const messages = await ProtobufLoader.loadDerivedClassesOf(Message);
		const services = await ProtobufLoader.loadDerivedClassesOf(Service);
		return {messages, services, types};
	}

	/** Loads type classes */
	private static async loadClasses(classes: Class[]): Promise<ClassWithInfo[]> {
		return await Promise.all(
			classes.map(ClassLoader.findOrThrowWithInfo)
		);
	}

	/** Loads either all messages or all services */
	private static async loadDerivedClassesOf(BaseClass: Class): Promise<ClassWithInfo[]> {
		const baseClassInfo = await ClassLoader.findOrThrow(BaseClass);
		const classInfos = baseClassInfo
			.findDerivedClasses()
			.filter(classInfo => !classInfo.source.endsWith(".test.js") && !classInfo.abstract);
		return await Promise.all(
			classInfos.map(ClassLoader.importWithInfo)
		);
	}
}