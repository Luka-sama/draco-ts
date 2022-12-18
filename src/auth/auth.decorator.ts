import _ from "lodash";
import Tr from "../core/tr.js";
import WS from "../core/ws.js";
import {EventHandler, LoggedArgs, Socket} from "../core/ws.typings.js";
import Zone from "../map/zone.js";

/**
 * The decorated method is available only if func returns an empty string, otherwise the returned string will be sent as info-event.
 * If addUserToArgs is true, adds user to arguments that the method will get.
 */
function OnlyCond(func: (sck: Socket) => string, loggedArgs = false): MethodDecorator {
	return function(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod: EventHandler = descriptor.value;

		descriptor.value = async function(args: LoggedArgs): Promise<void> {
			const isJest = (typeof jest == "object");
			const text = (isJest ? "" : func(args.sck));
			if (!text) {
				if (loggedArgs && !isJest) {
					args.user = args.sck.user!;
					args.zone = await Zone.getByEntity(args.user);
				}
				await originalMethod.call(this, args);
			} else {
				return args.sck.info(text);
			}
		};
		if (typeof propertyKey == "string") {
			WS.addEvent(_.snakeCase(propertyKey.replace(/^WS([A-Z])/, "$1")), descriptor.value);
		}

		return descriptor;
	};
}

/** The decorated method is available to guests only */
export function OnlyGuest(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? Tr.get("PLEASE_LOGOUT") : "");
}

/** The decorated method is available to logged account (but not logged user) only */
export function OnlyLoggedAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? Tr.get("PLEASE_LOGOUT") : "") : Tr.get("PLEASE_LOGIN_ACCOUNT"));
}

/** The decorated method is available to logged account or logged user (but not to guest) */
export function OnlyLoggedAtLeastAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? "" : Tr.get("PLEASE_LOGIN_ACCOUNT"));
}

/** The decorated method is available to logged user only */
export function OnlyLogged(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? "" : Tr.get("PLEASE_LOGIN_USER")) : Tr.get("PLEASE_LOGIN_ACCOUNT"), true);
}

/** The decorated method is available for all */
export function ForAll(): MethodDecorator {
	return OnlyCond(() => "");
}