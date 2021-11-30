import {transformAndValidate} from "class-transformer-validator";
import _ from "lodash";
import Account from "./entities/account";
import User from "./entities/user";
import WS, {EM, Socket, UserData} from "./ws";

function toSpaceCase(str: string): string {
	return str.split("").map((letter: string, idx: number) => {
		return letter.toUpperCase() === letter
			? `${idx !== 0 ? ' ' : ''}${letter.toLowerCase()}`
			: letter;
	}).join("");
}

function OnlyCond(func: Function, info: string) {
	return function(target: Object, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;

		descriptor.value = function (sck: Socket, em: EM, data: UserData, ...args: any) {
			if (func(sck, em, data)) {
				originalMethod.apply(this, [sck, em, data].concat(args));
			} else {
				return sck.emit("info", info);
			}
		};
		WS.addEvent(toSpaceCase(propertyKey), descriptor.value);

		return descriptor;
	};
}

export function OnlyGuest() {
	return OnlyCond((sck: Socket) => !sck.account, "PLEASE_LOGOUT");
}

export function OnlyLoggedAccount() {
	return OnlyCond((sck: Socket) => sck.account && !sck.user, "PLEASE_LOGIN_ACCOUNT");
}

export function OnlyLoggedAtLeastAccount() {
	return OnlyCond((sck: Socket) => sck.account, "PLEASE_LOGIN_ACCOUNT");
}

export function OnlyLogged() {
	return OnlyCond((sck: Socket) => sck.account && sck.user, "PLEASE_LOGIN_USER");
}

export default class Auth {
	@OnlyGuest()
	static async signUpAccount(sck: Socket, em: EM, data: UserData) {
		const acc = await transformAndValidate(Account, data);
		await em.persistAndFlush(acc);
	}

	@OnlyGuest()
	static async signInAccount(sck: Socket, em: EM, data: UserData) {
		if (!_.isString(data.nameOrEmail) || !_.isString(data.pass)) {
			return;
		}

		const acc = await em.findOne(Account, {
			$or: [
				{email: data.nameOrEmail}, {name: data.nameOrEmail}
			]
		});

		if (!acc) {
			return sck.emit("info", "AUTH_ACCOUNT_NOT_FOUND");
		} else if (acc.pass != data.pass) {
			return sck.emit("info", "AUTH_WRONG_PASSWORD");
		}

		sck.account = acc;
	}

	@OnlyLoggedAccount()
	static async signUpUser(sck: Socket, em: EM, data: UserData) {
		const user = await transformAndValidate(User, data);
		user.account = sck.account;
		await em.persistAndFlush(user);
	}

	@OnlyLoggedAccount()
	static async signInUser(sck: Socket, em: EM, data: UserData) {
		if (!_.isString(data.name)) {
			return;
		}

		const user = await em.findOne(User, {name: data.name, account: sck.account});
		if (!user) {
			return sck.emit("info", "AUTH_USER_NOT_FOUND");
		}

		sck.user = user;
	}
}