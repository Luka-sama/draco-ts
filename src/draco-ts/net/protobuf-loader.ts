import {Vector2f, Vector2i, Vector3f, Vector3i} from "../math/vector.js";
import ClassInfo from "../type-analyzer/class-info.js";
import ClassLoader from "../type-analyzer/class-loader.js";
import {Class} from "../typings.js";
import BaseProtoClass from "./base-proto-class.js";
import Message from "./message.js";
import {ProtoClassWithInfo, TypeClassWithInfo} from "./protobuf.js";
import Service from "./service.js";

/** This class prepares all necessary data for {@link Protobuf} */
export default class ProtobufLoader {
	/** Loads all classes that {@link Protobuf} need */
	public static async loadAllClasses(): Promise<{
		types: TypeClassWithInfo[], messages: ProtoClassWithInfo[]; services: ProtoClassWithInfo[]
	}> {
		const types = await ProtobufLoader.loadClasses([
			Vector2f, Vector2i, Vector3f, Vector3i,
		]);
		const messages = await ProtobufLoader.loadDerivedClassesOf(Message);
		const services = await ProtobufLoader.loadDerivedClassesOf(Service);
		return {messages, services, types};
	}

	/** Loads type classes */
	private static async loadClasses(classes: Class[]): Promise<TypeClassWithInfo[]> {
		const promises = classes.map(ClassLoader.findOrThrow) as Promise<ClassInfo>[];
		const promiseResults = await Promise.allSettled(promises);
		const classesWithInfo: TypeClassWithInfo[] = [];
		for (let i = 0; i < promiseResults.length; i++) {
			const result = promiseResults[i];
			if (result.status == "fulfilled") {
				classesWithInfo.push({TypeClass: classes[i], classInfo: result.value});
			}
		}
		return classesWithInfo;
	}

	/** Loads either all messages or all services */
	private static async loadDerivedClassesOf(BaseClass: Class): Promise<ProtoClassWithInfo[]> {
		const baseClassInfo = await ClassLoader.findOrThrow(BaseClass);
		const classInfos = baseClassInfo
			.findDerivedClasses()
			.filter(classInfo => !classInfo.source.endsWith(".test.js") && !classInfo.abstract);
		const promises = classInfos.map(ClassLoader.import) as Promise<typeof BaseProtoClass>[];
		const promiseResults = await Promise.allSettled(promises);
		const classes: ProtoClassWithInfo[] = [];
		for (let i = 0; i < promiseResults.length; i++) {
			const result = promiseResults[i];
			if (result.status == "fulfilled") {
				classes.push({ProtoClass: result.value, classInfo: classInfos[i]});
			}
		}
		return classes;
	}
}