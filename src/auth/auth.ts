import {randomBytes} from "crypto";
import {promisify} from "util";
import Zone from "../map/zone";
import {tr} from "../util";
import {ensure, hasErrors, Is, toObject} from "../validation";
import {EventArgs, GuestArgs, Socket} from "../ws";
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
	static async signUpAccount({em, sck, raw}: GuestArgs): Promise<boolean> {
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
	static async signInAccount({em, sck, raw}: GuestArgs): Promise<void> {
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
	static async signUpUser({em, sck, raw}: GuestArgs): Promise<boolean> {
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
	static async signInUser({em, sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {name: Is.string});

		const user = await em.findOne(User, {name: data.name, account: sck.account});
		if (!user) {
			return sck.emit("sign_in_user_error", {error: tr("AUTH_USER_NOT_FOUND")});
		}

		user.connected = true;
		user.account = sck.account!;
		sck.user = user;
		user.socket = sck;
		user.emit("sign_in_user", {accountToken: user.account.token, userName: user.name});
	}

	@OnlyLoggedAccount()
	static async getUserList({em, sck}: GuestArgs): Promise<void> {
		const userList = (await em.find(User, {account: sck.account}, {fields: ["name"]})).map(user => user.name);
		sck.emit("get_user_list", {list: userList});
	}

	@OnlyGuest()
	@Limit(1000)
	static async signInByToken({em, sck, raw}: GuestArgs) {
		const data = ensure(raw, {accountToken: Is.string, userName: Is.string});
		const user = await em.findOne(User, {name: data.userName}, {populate: ["account"]});
		if (!user || user.account.token != data.accountToken) {
			return sck.info(tr("WRONG_TOKEN"));
		}

		sck.account = user.account;
		sck.user = user;
		user.socket = sck;
		user.connected = true;
		user.emit("sign_in_user");
	}

	@OnlyLoggedAtLeastAccount()
	static async logOutAccount({sck}: GuestArgs) {
		delete sck.account;
		delete sck.user;
	}

	@OnlyLogged()
	static async logOutUser({user}: EventArgs) {
		delete user.socket!.user;
	}

	@OnlyLogged()
	static async startGame({em, user}: EventArgs) {
		const zone = await Zone.getByUser(em, user);
		zone.sub(user);
		zone.emit(user);
	}

	private static async generateToken() {
		return (await promisify(randomBytes)(48)).toString("hex");
	}
}