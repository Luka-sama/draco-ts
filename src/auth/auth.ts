import {randomBytes} from "crypto";
import {promisify} from "util";
import {tr} from "../util";
import {ensure, hasErrors, Is, toObject} from "../validation";
import {EM, Socket, UserData} from "../ws";
import Account from "./account.entity";
import {ForAll, Limit, OnlyGuest, OnlyLogged, OnlyLoggedAccount, OnlyLoggedAtLeastAccount} from "./auth.decorator";
import User from "./user.entity";

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
		await em.persist(acc);
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
		await em.persist(user);
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