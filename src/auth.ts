import {isString} from "class-validator";
import * as _ from "lodash";
import Account from "./entities/account";
import User from "./entities/user";
import {getToken, tr} from "./util";
import {ensure, hasErrors, Is, toObject} from "./validation";
import WS, {EM, EventHandler, Socket, UserData} from "./ws";

function OnlyCond(func: (sck: Socket) => string, replaceSocketWithUser = false): MethodDecorator {
	return function(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod: EventHandler = descriptor.value;

		descriptor.value = async function(sck: Socket, em: EM, data: UserData) {
			const text = (typeof jest == "object" ? "" : func(sck));
			if (!text) {
				await originalMethod.apply(this, [(replaceSocketWithUser ? sck.user : sck), em, data]);
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
 * @category Auth decorator
 */
export function OnlyGuest(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? tr("PLEASE_LOGOUT") : "");
}

/**
 * Decorated method is available to logged account (but not logged user) only
 *
 * @category Auth decorator
 */
export function OnlyLoggedAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? tr("PLEASE_LOGOUT") : "") : tr("PLEASE_LOGIN_ACCOUNT"));
}

/**
 * Decorated method is available to logged account or logged user (but not to guest)
 *
 * @category Auth decorator
 */
export function OnlyLoggedAtLeastAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? "" : tr("PLEASE_LOGIN_ACCOUNT"));
}

/**
 * Decorated method is available to logged user only
 *
 * @category Auth decorator
 */
export function OnlyLogged(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? "" : tr("PLEASE_LOGIN_USER")) : tr("PLEASE_LOGIN_ACCOUNT"), true);
}

/**
 * Class for authorization (sign up and sign in)
 */
export default class Auth {
	@OnlyGuest()
	static async signUpAccount(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const acc = await toObject(Account, raw);
		if (hasErrors(acc)) {
			return sck.emit("sign_up_account_errors", {errors: acc});
		}
		acc.token = await getToken();
		await em.persistAndFlush(acc);
		sck.emit("sign_up_account");
	}

	@OnlyGuest()
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
	static async signUpUser(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const user = await toObject(User, raw);
		if (hasErrors(user)) {
			return sck.emit("sign_up_user_errors", {errors: user});
		}
		user.account = sck.account;
		await em.persistAndFlush(user);
		sck.emit("sign_up_user");
	}

	@OnlyLoggedAccount()
	static async signInUser(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const data = ensure(raw, {name: Is.string});

		const user = await em.findOne(User, {name: data.name, account: sck.account});
		if (!user) {
			return sck.emit("sign_in_user_error", {error: tr("AUTH_USER_NOT_FOUND")});
		}

		user.account = sck.account;
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
}