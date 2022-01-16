import {isString} from "class-validator";
import * as _ from "lodash";
import {tr} from "../util";
import WS, {EM, EventHandler, Socket, UserData} from "../ws";
import User from "./user.entity";

function OnlyCond(func: (sck: Socket) => string, replaceSocketWithUser = false): MethodDecorator {
	return function(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod: EventHandler = descriptor.value;

		descriptor.value = async function(sck: Socket, em: EM, data: UserData) {
			const text = (typeof jest == "object" ? "" : func(sck));
			if (!text) {
				await originalMethod.apply(this, [(replaceSocketWithUser ? sck.user! : sck), em, data]);
			} else {
				return sck.info(text);
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

		descriptor.value = async function(sckOrUser: Socket | User, em: EM, data: UserData) {
			const sck = (sckOrUser instanceof User ? sckOrUser.socket! : sckOrUser);
			if (!sck.limits[methodName]) {
				sck.limits[methodName] = [];
			}
			const now = Date.now();
			const limits = sck.limits[methodName] = sck.limits[methodName].filter(time => time >= now - ms);

			if (typeof jest == "object" || limits.length < times) {
				limits.push(now);
				const value = await originalMethod.apply(this, [sckOrUser, em, data]);
				if (value === false) {
					limits.splice(limits.indexOf(now), 1);
				}
			} else if (errorText) {
				return sckOrUser.info(errorText);
			}
		};

		return descriptor;
	};
}