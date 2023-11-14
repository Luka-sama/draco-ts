import BaseProtoClass from "./base-proto-class.js";

/**
 * This class can be used as a type in messages or services.
 * You could also use messages for such purposes. However, the difference is that a message type cannot be sent
 * or received alone, it should be a part of a message or a service.
 */
export default abstract class MessageType extends BaseProtoClass {}