import assert from "assert/strict";
import {Constructor, PropertiesOf} from "../typings.js";
import BaseProtoClass from "./base-proto-class.js";
import Session from "./session.js";

/**
 * A message that can be sent to the client. You should extend this class to create your own messages.
 * It will be then sent as binary data for the most performance.
 * On the client side, you should then have a service with an analogous name and the same properties.
 *
 * Please note that you should use `Float`, `Int32` etc. from `typings.ts` instead of imprecise `number`.
 * You can also use optional fields or default values. For optional fields without provided default values,
 * default value is calced as follows:
 * - Primitive values are treated as default values, i.e. `false` for booleans, `0` for numbers, `""` for strings.
 * - Arrays are treated as arrays of length 0.
 * - Enums get their first value (with index 0).
 * - Vectors are treated as zero vectors (with all components equal to zero).
 * - Only messages and message types will remain `undefined`.
 *
 * Example of use (on the client side you should then have ChatService):
 * ```ts
 * export class ChatMessage {
 *   text?: string;
 *   time!: Int64;
 *   userName = "anonymous";
 *   isImportant!: boolean;
 * }
 * ```
 */
export default abstract class Message extends BaseProtoClass {
	/** Creates and sends the message */
	public static send<T extends Constructor<Message>>(
		this: T & typeof Message, sessions: Session | Iterable<Session>, params: PropertiesOf<InstanceType<T>>
	): void {
		this.create(params).send(sessions);
	}

	/** Sends the message */
	public send(sessions: Session | Iterable<Session>): void {
		assert(this.created, `You should use the method "create" to create a message, not a constructor.`);
		sessions = (Symbol.iterator in sessions ? sessions : [sessions]);
		for (const session of sessions) {
			session.send(this);
		}
	}
}