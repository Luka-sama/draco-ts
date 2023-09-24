import {randomBytes} from "crypto";
import {promisify} from "util";
import Limit from "../draco-ts/limit.js";
import ORM from "../draco-ts/orm/orm.js";
import Synchronizer from "../draco-ts/sync/sync.js";
import Tr from "../draco-ts/tr.js";
import {ensure, Is} from "../draco-ts/util/validation.js";
import {Vec2} from "../draco-ts/util/vector.js";
import {GuestArgs} from "../draco-ts/ws.js";
import Magic from "../magic/magic.js";
import Location from "../map/location.entity.js";
import Zone from "../map/zone.js";
import Account from "./account.entity.js";
import {
	ForAll,
	LoggedArgs,
	OnlyGuest,
	OnlyLogged,
	OnlyLoggedAccount,
	OnlyLoggedAtLeastAccount
} from "./auth.decorator.js";
import Session from "./session.js";
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
		Limit.strict("Auth.signUpAccount", sck, 60000, Tr.get("LIMIT_REACHED"));

		const errors = [
			(!/^[a-z0-9-]+$/i.test(name) ? Tr.get("ACCOUNT_NAME_FORMAT_WRONG") : null),
			(!/^(.+)@(.+)\.(.+)$/i.test(mail) ? Tr.get("MAIL_FORMAT_WRONG") : null),
			(pass.length < 8 || pass.length > 32 ? Tr.get("PASS_LENGTH_WRONG") : null),
		].filter(error => error);

		if (errors.length < 1) {
			Limit.updateLastTime("Auth.signUpAccount", sck);
			const token = await Auth.generateToken();
			Account.create({name, mail, pass, token});
			sck.emit("sign_up_account");
		} else {
			sck.emit("sign_up_account_errors", {errors});
		}
	}

	@OnlyGuest()
	static async signInAccount({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {nameOrMail: Is.string, pass: Is.string});
		await Limit.softUpdatingTime("Auth.signInAccount", sck, 1000);

		const account = await ORM.findOne(Account, `mail='${data.nameOrMail}' or name='${data.nameOrMail}'`);
		if (!account) {
			sck.emit("sign_in_account_error", {error: Tr.get("AUTH_ACCOUNT_NOT_FOUND")});
		} else if (account.pass != data.pass) {
			sck.emit("sign_in_account_error", {error: Tr.get("AUTH_WRONG_PASSWORD")});
		} else {
			Session.signInAccount(sck, account);
			sck.emit("sign_in_account", {token: account.token});
		}
	}

	@OnlyLoggedAccount()
	static async signUpUser({sck, raw}: GuestArgs): Promise<void> {
		const {name} = ensure(raw, {name: Is.string});
		Limit.strict("Auth.signUpUser", sck, 60000, Tr.get("LIMIT_REACHED"));

		const errors = [
			(!/^[A-Z][a-z]*$/.test(name) ? Tr.get("USER_NAME_FORMAT_WRONG") : null),
		].filter(error => error);
		if (errors.length < 1) {
			Limit.updateLastTime("Auth.signUpUser", sck);
			const account = sck.account!;
			const location = await Location.get(1);
			const position = Vec2(0, 0);
			const user = User.create({name, account, location, position});
			const zone = await Zone.getByEntity(user);
			await Magic.createLightsForMage(user, zone);
			sck.emit("sign_up_user");
		} else {
			sck.emit("sign_up_user_errors", {errors});
		}
	}

	@OnlyLoggedAccount()
	static async signInUser({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {name: Is.string});
		await Limit.softUpdatingTime("Auth.signInUser", sck, 1000);

		const user = await User.get(`name='${data.name}' and account_id=${sck.account?.id}`);
		if (user) {
			// TODO: log out old socket
			Session.signInUser(sck, user);
			user.emit("sign_in_user", {accountToken: user.account.token, userName: user.name});
		} else {
			sck.emit("sign_in_user_error", {error: Tr.get("AUTH_USER_NOT_FOUND")});
		}
	}

	/** Returns a list of usernames. The player can see this list after logging into the account */
	@OnlyLoggedAccount()
	static async getUserList({sck}: GuestArgs): Promise<void> {
		const userList = (await ORM.find(User, `account_id=${sck.account?.id} ORDER BY id ASC`)).map(user => user.name);
		sck.emit("get_user_list", {list: userList});
	}

	/** Quick sign in by token (signs in both account and user) */
	@OnlyGuest()
	static async signInByToken({sck, raw}: GuestArgs): Promise<void> {
		const data = ensure(raw, {accountToken: Is.string, userName: Is.string});
		await Limit.softUpdatingTime("Auth.signInByToken", sck, 1000);

		const user = await User.get(`name='${data.userName}'`);
		if (user && user.account.token == data.accountToken) {
			// TODO: log out old sockets
			Session.signInAccount(sck, user.account);
			Session.signInUser(sck, user);
			user.emit("sign_in_user");
		} else {
			sck.emit("info", {text: Tr.get("WRONG_TOKEN")});
		}
	}

	@OnlyLoggedAtLeastAccount()
	static logOutAccount({sck}: GuestArgs): void {
		Session.logOutAccount(sck);
	}

	@OnlyLogged()
	static logOutUser({sck}: LoggedArgs): void {
		Session.logOutUser(sck);
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