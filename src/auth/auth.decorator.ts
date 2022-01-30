import {isString} from "class-validator";
import * as _ from "lodash";
import {tr} from "../util";
import WS, {EventHandler, GuestArgs, LoggedArgs, Socket} from "../ws";

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
		if (isString(propertyKey)) {
			WS.addEvent(_.snakeCase(propertyKey.replace(/^WS([A-Z])/, "$1")), descriptor.value);
		}

		return descriptor;
	};
}

/**
 * Decorated method is available to guests only
 *
 * @category Access decorator
 */
export function OnlyGuest(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? tr("PLEASE_LOGOUT") : "");
}

/**
 * Decorated method is available to logged account (but not logged user) only
 *
 * @category Access decorator
 */
export function OnlyLoggedAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? tr("PLEASE_LOGOUT") : "") : tr("PLEASE_LOGIN_ACCOUNT"));
}

/**
 * Decorated method is available to logged account or logged user (but not to guest)
 *
 * @category Access decorator
 */
export function OnlyLoggedAtLeastAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? "" : tr("PLEASE_LOGIN_ACCOUNT"));
}

/**
 * Decorated method is available to logged user only
 *
 * @category Access decorator
 */
export function OnlyLogged(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? "" : tr("PLEASE_LOGIN_USER")) : tr("PLEASE_LOGIN_ACCOUNT"), true);
}

/**
 * Decorated method is available for all
 *
 * @category Access decorator
 */
export function ForAll(): MethodDecorator {
	return OnlyCond(() => "");
}

/**
 * Limits
 *
 * @category Access decorator
 */
export function Limit(ms: number, errorText = tr("LIMIT_REACHED"), times = 1): MethodDecorator {
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