import {QueryOrder} from "@mikro-orm/core";
import {randomBytes} from "crypto";
import {promisify} from "util";
import {EM} from "../core/orm";
import Synchronizer from "../core/sync";
import {tr} from "../core/util";
import {ensure, hasErrors, Is, toObject} from "../core/validation";
import {GuestArgs, LoggedArgs} from "../core/ws.typings";
import Location from "../map/location.entity";
import {Vec2} from "../math/vector.embeddable";
import Account from "./account.entity";
import {ForAll, Limit, OnlyGuest, OnlyLogged, OnlyLoggedAccount, OnlyLoggedAtLeastAccount} from "./auth.decorator";
import User from "./user.entity";

/** Class for authorization (sign up and sign in) */
export default class Auth {
	@ForAll()
	static ping({sck}: GuestArgs): void {
		sck.emit("pong");
	}

	@OnlyGuest()
	@Limit(60000)
	static async signUpAccount({sck, raw}: GuestArgs): Promise<boolean> {
		const acc = await toObject(Account, raw);
		if (hasErrors(acc)) {
			sck.emit("sign_up_account_errors", {errors: acc});
			return false;
		}

		acc.token = await Auth.generateToken();
		await EM.persist(acc);
		sck.emit("sign_up_account");
		return true;
	}

	@OnlyGuest()
	@Limit(1000)
	static async signInAccount({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {nameOrMail: Is.string, pass: Is.string});
		const acc = await EM.findOne(Account, {
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
	static async signUpUser({sck, raw}: GuestArgs): Promise<boolean> {
		const user = await toObject(User, raw);
		if (hasErrors(user)) {
			sck.emit("sign_up_user_errors", {errors: user});
			return false;
		}

		user.account = sck.account!;
		user.location = EM.getReference(Location, 1);
		user.position = Vec2(0, 0);
		await user.create();

		sck.emit("sign_up_user");
		return true;
	}

	@OnlyLoggedAccount()
	@Limit(1000)
	static async signInUser({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {name: Is.string});

		const user = await EM.findOne(User, {name: data.name, account: sck.account});
		if (!user) {
			return sck.emit("sign_in_user_error", {error: tr("AUTH_USER_NOT_FOUND")});
		}

		user.connected = true;
		sck.user = user;
		user.socket = sck;
		user.emit("sign_in_user", {accountToken: user.account.token, userName: user.name});
	}

	/** Returns a list of usernames. The player can see this list after logging into the account */
	@OnlyLoggedAccount()
	static async getUserList({sck}: GuestArgs): Promise<void> {
		const userList = (await EM.find(User, {account: sck.account}, {orderBy: {id: QueryOrder.ASC}})).map(user => user.name);
		sck.emit("get_user_list", {list: userList});
	}

	/** Quick sign in by token (signs in both account and user) */
	@OnlyGuest()
	@Limit(1000)
	static async signInByToken({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {accountToken: Is.string, userName: Is.string});
		const user = await EM.findOne(User, {name: data.userName}, {populate: ["account"]});
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
	static logOutAccount({sck}: GuestArgs): void {
		if (sck.user) {
			sck.user.connected = false;
			delete sck.user.socket;
		}
		delete sck.account;
		delete sck.user;
	}

	@OnlyLogged()
	static logOutUser({user}: LoggedArgs): void {
		delete user.socket!.user;
	}

	@OnlyLogged()
	static async startGame({user}: LoggedArgs): Promise<void> {
		user.emit("my_id", {myId: user.id});
		await Synchronizer.firstLoad(user);
	}

	private static async generateToken(): Promise<string> {
		return (await promisify(randomBytes)(48)).toString("hex");
	}
}