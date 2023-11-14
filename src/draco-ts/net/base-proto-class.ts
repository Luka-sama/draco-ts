import {Constructor, PropertiesOf} from "../typings.js";

/** Base class for messages and services. See {@link Message} and {@link Service} */
export default abstract class BaseProtoClass {
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