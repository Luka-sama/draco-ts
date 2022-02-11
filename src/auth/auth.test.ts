import Auth from "./auth";

test("signUpAccount", async() => {
	await Auth.signUpAccount(guestArgs);
	expect(sck.emit).toHaveBeenCalledWith("sign_up_account_errors", {errors: expect.any(Array)});
});

test("getUserList", async() => {
	await Auth.getUserList(guestArgs);
	expect(sck.emit).toHaveBeenCalledWith("get_user_list", {list: ["Luka", "Test"]});
});