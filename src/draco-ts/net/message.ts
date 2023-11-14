import assert from "assert/strict";
import {Constructor, PropertiesOf} from "../typings.js";
import BaseProtoClass from "./base-proto-class.js";
import Protobuf from "./protobuf.js";
import Session from "./session.js";

/**
 * A message that can be sent to the client. You should extend this class to create your own messages.
 * It will be then sent as binary data for the most performance.
 * However, to make it work, you should have a service with an analogous name
 * and the same properties on the client side.
 *
 * Please note that you should use `Float`, `Int32` etc. from `typings.ts` instead of imprecise `number`.
 * Also, do not use optional fields. If you really need this, make sure to provide default values
 * as in the example below.
 *
 * Example of use (on the client side you should then have ChatService):
 * ```ts
 * export class ChatMessage {
 *   text!: string;
 *   time!: Int64;
 *   userName!: string;
 *   isImportant?: boolean = false;
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
	public send(sessions: Session | Iterable<Session>) {
		assert(this.created, `You should use the method "create" to create a message, not a constructor.`);
		const buffer = Protobuf.encode(this);
		for (const session of (sessions instanceof Session ? [sessions] : sessions)) {
			session.send(buffer);
		}
	}
}