import _ from "lodash";
import Tr from "../core/tr";
import WS from "../core/ws";
import {EventHandler, GuestArgs, LoggedArgs, Socket} from "../core/ws.typings";

/**
 * The decorated method is available only if func returns an empty string, otherwise the returned string will be sent as info-event.
 * If addUserToArgs is true, adds user to arguments that the method will get.
 */
function OnlyCond(func: (sck: Socket) => string, addUserToArgs = false): MethodDecorator {
	return function(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod: EventHandler = descriptor.value;

		descriptor.value = async function(args: LoggedArgs): Promise<void> {
			const text = (typeof jest == "object" ? "" : func(args.sck));
			if (!text) {
				if (addUserToArgs) {
					args.user = args.sck.user!;
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

/**
 * The decorated method can be called at most `times` times per `ms` ms,
 * otherwise the user will get an info-event with text `errorText`.
 */
export function Limit(ms: number, errorText = Tr.get("LIMIT_REACHED"), times = 1): MethodDecorator {
	return function(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod: EventHandler = descriptor.value;
		const targetName = (typeof target == "function" ? `${target.name}.` : "");
		const methodName = `${targetName}${propertyKey.toString()}`;

		descriptor.value = async function(args: GuestArgs): Promise<void> {
			const sck = args.sck;
			if (!sck.limits[methodName]) {
				sck.limits[methodName] = [];
			}
			const now = Date.now();
			const limits = sck.limits[methodName] = sck.limits[methodName].filter(time => time >= now - ms);

			if (typeof jest == "object" || limits.length < times) {
				limits.push(now);
				const value = await originalMethod.call(this, args);
				if (value === false) {
					limits.splice(limits.indexOf(now), 1);
				}
			} else if (errorText) {
				return sck.info(errorText);
			}
		};

		return descriptor;
	};
}