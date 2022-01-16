import {isString} from "class-validator";
import {randomBytes} from "crypto";
import * as _ from "lodash";
import {promisify} from "util";
import {tr} from "../util";
import {ensure, hasErrors, Is, toObject} from "../validation";
import WS, {EM, EventHandler, Socket, UserData} from "../ws";
import Account from "./account.entity";
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

/**
 * Class for authorization (sign up and sign in)
 */
export default class Auth {
	@ForAll()
	static ping(sck: Socket) {
		sck.emit("pong");
	}

	@OnlyGuest()
	@Limit(60000)
	static async signUpAccount(sck: Socket, em: EM, raw: UserData): Promise<boolean> {
		const acc = await toObject(Account, raw);
		if (hasErrors(acc)) {
			sck.emit("sign_up_account_errors", {errors: acc});
			return false;
		}

		acc.token = await Auth.generateToken();
		await em.persistAndFlush(acc);
		sck.emit("sign_up_account");
		return true;
	}

	@OnlyGuest()
	@Limit(1000)
	static async signInAccount(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const data = ensure(raw, {nameOrMail: Is.string, pass: Is.string});
		const acc = await em.findOne(Account, {
			$or: [
				{mail: data.nameOrMail}, {name: data.nameOrMail}
			]
		});

		if (!acc) {
			return sck.emit("sign_in_account_error", {error: tr("AUTH_ACCOUNT_NOT_FOUND")});
		} else if (acc.pass != data.pass) {
			return sck.emit("sign_in_account_error", {error: tr("AUTH_WRONG_PASSWORD")});
		}

		sck.account = acc;
		sck.emit("sign_in_account", {token: acc.token});
	}

	@OnlyLoggedAccount()
	@Limit(60000)
	static async signUpUser(sck: Socket, em: EM, raw: UserData): Promise<boolean> {
		const user = await toObject(User, raw);
		if (hasErrors(user)) {
			sck.emit("sign_up_user_errors", {errors: user});
			return false;
		}

		user.account = sck.account!;
		await em.persistAndFlush(user);
		sck.emit("sign_up_user");
		return true;
	}

	@OnlyLoggedAccount()
	@Limit(1000)
	static async signInUser(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const data = ensure(raw, {name: Is.string});

		const user = await em.findOne(User, {name: data.name, account: sck.account});
		if (!user) {
			return sck.emit("sign_in_user_error", {error: tr("AUTH_USER_NOT_FOUND")});
		}

		user.account = sck.account!;
		sck.user = user;
		user.socket = sck;
		user.emit("sign_in_user", {accountToken: user.account.token, userName: user.name});
	}

	@OnlyLoggedAccount()
	static async getUserList(sck: Socket, em: EM): Promise<void> {
		const userList = (await em.find(User, {account: sck.account}, {fields: ["name"]})).map(user => user.name);
		sck.emit("get_user_list", {list: userList});
	}

	@OnlyGuest()
	@Limit(1000)
	static async signInByToken(sck: Socket, em: EM, raw: UserData) {
		const data = ensure(raw, {accountToken: Is.string, userName: Is.string});
		const user = await em.findOne(User, {name: data.userName}, {populate: ["account"]});
		if (!user || user.account.token != data.accountToken) {
			return sck.info(tr("WRONG_TOKEN"));
		}

		sck.account = user.account;
		sck.user = user;
		user.socket = sck;
		user.emit("sign_in_user");
	}

	@OnlyLoggedAtLeastAccount()
	static async logOutAccount(sck: Socket) {
		delete sck.account;
		delete sck.user;
	}

	@OnlyLogged()
	static async logOutUser(user: User) {
		delete user.socket!.user;
	}

	private static async generateToken() {
		return (await promisify(randomBytes)(48)).toString("hex");
	}
}