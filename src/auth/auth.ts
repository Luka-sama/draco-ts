import {QueryOrder} from "@mikro-orm/core";
import {randomBytes} from "crypto";
import {promisify} from "util";
import {EM} from "../core/orm.js";
import Synchronizer from "../core/sync.js";
import Tr from "../core/tr.js";
import {GuestArgs, LoggedArgs} from "../core/ws.typings.js";
import Magic from "../magic/magic.js";
import Location from "../map/location.entity.js";
import Limit from "../util/limit.js";
import {ensure, Is} from "../util/validation.js";
import {Vec2} from "../util/vector.embeddable.js";
import Account from "./account.entity.js";
import {ForAll, OnlyGuest, OnlyLogged, OnlyLoggedAccount, OnlyLoggedAtLeastAccount} from "./auth.decorator.js";
import User from "./user.entity.js";

/** Class for authorization (sign up and sign in) */
export default class Auth {
	@ForAll()
	static ping({sck}: GuestArgs): void {
		sck.emit("pong");
	}

	@OnlyGuest()
	static async signUpAccount({sck, raw}: GuestArgs): Promise<void> {
		const {name, mail, pass} = ensure(raw, {name: Is.string, mail: Is.string, pass: Is.string});
		Limit.strict("Auth.signUpAccount", sck, 60000);

		const errors = [
			(!/^[a-z0-9-]+$/i.test(name) ? Tr.get("ACCOUNT_NAME_FORMAT_WRONG") : null),
			(!/^(.+)@(.+)\.(.+)$/i.test(mail) ? Tr.get("MAIL_FORMAT_WRONG") : null),
			(pass.length < 8 || pass.length > 32 ? Tr.get("PASS_LENGTH_WRONG") : null),
		].filter(error => error);

		if (errors.length < 1) {
			Limit.updateLastTime("Auth.signUpAccount", sck);
			const token = await Auth.generateToken();
			const account = new Account(name, mail, pass, token);
			await account.create();
			sck.emit("sign_up_account");
		} else {
			sck.emit("sign_up_account_errors", {errors});
		}
	}

	@OnlyGuest()
	static async signInAccount({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {nameOrMail: Is.string, pass: Is.string});
		await Limit.softUpdatingTime("Auth.signInAccount", sck, 1000);

		const acc = await EM.findOne(Account, {
			$or: [
				{mail: data.nameOrMail}, {name: data.nameOrMail}
			]
		});
		if (!acc) {
			sck.emit("sign_in_account_error", {error: Tr.get("AUTH_ACCOUNT_NOT_FOUND")});
		} else if (acc.pass != data.pass) {
			sck.emit("sign_in_account_error", {error: Tr.get("AUTH_WRONG_PASSWORD")});
		} else {
			sck.account = acc;
			sck.emit("sign_in_account", {token: acc.token});
		}
	}

	@OnlyLoggedAccount()
	static async signUpUser({sck, raw}: GuestArgs): Promise<void> {
		const {name} = ensure(raw, {name: Is.string});
		Limit.strict("Auth.signUpUser", sck, 60000);

		const errors = [
			(!/^[A-Z][a-z]*$/.test(name) ? Tr.get("USER_NAME_FORMAT_WRONG") : null),
		].filter(error => error);
		if (errors.length < 1) {
			Limit.updateLastTime("Auth.signUpUser", sck);
			const account = sck.account!;
			const location = EM.getReference(Location, 1);
			const position = Vec2(0, 0);
			const user = new User(name, account, location, position);
			await user.create();
			await Magic.createLightsForMage(user);
			sck.emit("sign_up_user");
		} else {
			sck.emit("sign_up_user_errors", {errors});
		}
	}

	@OnlyLoggedAccount()
	static async signInUser({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {name: Is.string});
		await Limit.softUpdatingTime("Auth.signInUser", sck, 1000);

		const user = await EM.findOne(User, {name: data.name, account: sck.account}, {populate: true});
		if (user) {
			user.connected = true;
			sck.user = user;
			user.socket = sck;
			user.emit("sign_in_user", {accountToken: user.account.token, userName: user.name});
		} else {
			sck.emit("sign_in_user_error", {error: Tr.get("AUTH_USER_NOT_FOUND")});
		}
	}

	/** Returns a list of usernames. The player can see this list after logging into the account */
	@OnlyLoggedAccount()
	static async getUserList({sck}: GuestArgs): Promise<void> {
		const userList = (await EM.find(User, {account: sck.account}, {orderBy: {id: QueryOrder.ASC}})).map(user => user.name);
		sck.emit("get_user_list", {list: userList});
	}

	/** Quick sign in by token (signs in both account and user) */
	@OnlyGuest()
	static async signInByToken({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {accountToken: Is.string, userName: Is.string});
		await Limit.softUpdatingTime("Auth.signInByToken", sck, 1000);

		const user = await EM.findOne(User, {name: data.userName}, {populate: true});
		if (user && user.account.token == data.accountToken) {
			sck.account = user.account;
			sck.user = user;
			user.socket = sck;
			user.connected = true;
			user.emit("sign_in_user");
		} else {
			sck.info(Tr.get("WRONG_TOKEN"));
		}
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
	static startGame({user, zone}: LoggedArgs): void {
		user.emit("my_id", {myId: user.id});
		Synchronizer.firstSync(user, zone);
	}

	private static async generateToken(): Promise<string> {
		return (await promisify(randomBytes)(48)).toString("hex");
	}
}