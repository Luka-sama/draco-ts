import {isString} from "class-validator";
import Account from "./entities/account";
import User from "./entities/user";
import {ensure, hasErrors, Is, toObject} from "./validation";
import WS, {EM, Socket, UserData} from "./ws";

function toSnakeCase(str: string): string {
	return str.split("").map((letter: string, idx: number): string => {
		return letter.toUpperCase() === letter
			? `${idx !== 0 ? '_' : ''}${letter.toLowerCase()}`
			: letter;
	}).join("");
}

function OnlyCond(func: Function, replaceSocketWithUser = false): MethodDecorator {
	return function(target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod = descriptor.value;

		descriptor.value = function (sck: Socket, em: EM, data: UserData, ...args: any) {
			var text = func(sck, em, data);
			if (!text) {
				originalMethod.apply(this, [(replaceSocketWithUser ? sck.user : sck), em, data].concat(args));
			} else {
				return sck.info(text);
			}
		};
		if (isString(propertyKey)) {
			WS.addEvent(toSnakeCase(propertyKey), descriptor.value);
		}

		return descriptor;
	};
}

export function OnlyGuest(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? "PLEASE_LOGOUT" : "");
}

export function OnlyLoggedAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? "PLEASE_LOGOUT" : "") : "PLEASE_LOGIN_ACCOUNT");
}

export function OnlyLoggedAtLeastAccount(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? "" : "PLEASE_LOGIN_ACCOUNT");
}

export function OnlyLogged(): MethodDecorator {
	return OnlyCond((sck: Socket) => sck.account ? (sck.user ? "" : "PLEASE_LOGIN_USER") : "PLEASE_LOGIN_ACCOUNT");
}

/**
 * Class for authorization (sign up and sign in)
 *
 * @category Base Class
 */
export default class Auth {
	@OnlyGuest()
	static async signUpAccount(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const acc = await toObject(Account, raw);
		if (hasErrors(acc)) {
			return sck.emit("sign_up_account_errors", {errors: acc});
		}
		await acc.generateToken();
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
			return sck.emit("sign_in_account_error", {error: "AUTH_ACCOUNT_NOT_FOUND"});
		} else if (acc.pass != data.pass) {
			return sck.emit("sign_in_account_error", {error: "AUTH_WRONG_PASSWORD"});
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
		await user.generateToken();
		await em.persistAndFlush(user);
		sck.emit("sign_up_user");
	}

	@OnlyLoggedAccount()
	static async signInUser(sck: Socket, em: EM, raw: UserData): Promise<void> {
		const data = ensure(raw, {name: Is.string});

		const user = await em.findOne(User, {name: data.name, account: sck.account});
		if (!user) {
			return sck.emit("sign_in_user_error", {error: "AUTH_USER_NOT_FOUND"});
		}

		user.account = sck.account;
		sck.user = user;
		user.socket = sck;
		user.emit("sign_in_user", {account_token: user.account.token, user_token: user.token});
	}

	@OnlyLoggedAccount()
	static async getUserList(sck: Socket, em: EM): Promise<void> {
		const userList = (await em.find(User, {account: sck.account}, {fields: ["name"]})).map(user => user.name);
		sck.emit("get_user_list", {list: userList})
	}

	@OnlyGuest()
	static async signInByToken(sck: Socket, em: EM, raw: UserData) {
		const data = ensure(raw, {account_token: Is.string, user_token: Is.string});
		const user = await em.findOne(User, {token: data.user_token}, {populate: ["account"]});
		if (!user || user.account.token != data.account_token) {
			return sck.info("WRONG_TOKEN");
		}

		sck.account = user.account;
		sck.user = user;
		user.socket = sck;
		user.emit("sign_in_user");
	}
}