import Tr from "../draco-ts/tr.js";
import Auth from "./auth.js";

describe("signInAccount", () => {
	test("wrong name", async () => {
		await Auth.signInAccount({...guestArgs, raw: {nameOrMail: "some user that doesn't exist", pass: "123"}});
		expect(sck.emit).toHaveBeenCalledWith("sign_in_account_error", {error: Tr.get("AUTH_ACCOUNT_NOT_FOUND")});
	});

	test("wrong password", async () => {
		await Auth.signInAccount({...guestArgs, raw: {nameOrMail: "Luka-sama", pass: "wrong password"}});
		expect(sck.emit).toHaveBeenCalledWith("sign_in_account_error", {error: Tr.get("AUTH_WRONG_PASSWORD")});
	});

	test("success", async () => {
		await Auth.signInAccount({...guestArgs, raw: {nameOrMail: account.mail, pass: account.pass}});
		expect(sck.emit).toHaveBeenCalledWith("sign_in_account", {token: account.token});
	});
});

describe("signInUser", () => {
	test("wrong user", async () => {
		await Auth.signInUser({...guestArgs, raw: {name: "some user that doesn't exist"}});
		expect(sck.emit).toHaveBeenCalledWith("sign_in_user_error", {error: "AUTH_USER_NOT_FOUND"});
	});

	test("success", async () => {
		user.connected = false;
		await Auth.signInUser({...guestArgs, raw: {name: "Luka"}});
		expect(sck.emit).toHaveBeenCalledWith("sign_in_user", {accountToken: account.token, userName: "Luka"});
		expect(user.connected).toBeTruthy();
		expect(sck.account).toBe(user.account);
		expect(user.socket).toBe(sck);
	});
});

test("getUserList", async () => {
	await Auth.getUserList(guestArgs);
	expect(sck.emit).toHaveBeenCalledWith("get_user_list", {list: ["Luka", "Test"]});
});