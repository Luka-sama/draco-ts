import protobuf from "protobufjs";
import {Constructor, PropertiesOf} from "../typings.js";

/** Base class for messages and services. See {@link Message} and {@link Service} */
export default abstract class BaseProtoClass {
	/**
	 * The opcode of this message. It will be used to distinguish between the different messages.
	 * You don't need to set it as it will be set automatically.
	 * @internal
	 */
	public static _opcode: number;
	/**
	 * This message as a protobuf type.
	 * You don't need to set it as it will be set automatically.
	 * @internal
	 */
	public static _protobuf: protobuf.Type;
	/** A flag to ensure that the instance was created using {@link BaseProtoClass.create} instead of constructor */
	protected created = false;

	/** Creates a message with the given parameters that can then be sent to one or more users */
	public static create<T extends Constructor<BaseProtoClass>>(
		this: T, params: PropertiesOf<InstanceType<T>>
	): InstanceType<T> {
		const message = new this() as InstanceType<T>;
		Object.assign(message, params);
		message.created = true;
		return message;
	}
}