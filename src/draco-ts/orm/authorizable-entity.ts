import Message from "../net/message.js";
import Session from "../net/session.js";
import WS from "../net/ws.js";
import Entity, {InMemory} from "./entity.js";

export class AuthorizableEntity extends Entity {
	public session?: InMemory<Session>;

	public send(message: Message): void {
		if (!this.session) {
			return WS.logger.debug(`The entity does not have a session to send data to.`);
		}
		this.session.send(message);
	}
}