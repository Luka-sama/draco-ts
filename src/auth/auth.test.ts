import {mock, mockReset} from "jest-mock-extended";
import {EM, Socket} from "../ws";
import Auth from "./auth";

const sck = mock<Socket>();
const em = mock<EM>();
beforeEach(() => {
	mockReset(sck);
	mockReset(em);
});

test("signUpAccount", async() => {
	await Auth.signUpAccount(sck, em, {});
	expect(sck.emit).toHaveBeenCalledWith("sign_up_account_errors", {errors: expect.any(Array)});
});

test("getUserList", async() => {
	em.find.mockResolvedValueOnce([{id: 1, name: "UserA"}, {id: 2, name: "UserB"}]);
	await Auth.getUserList(sck, em);
	expect(sck.emit).toHaveBeenCalledWith("get_user_list", {list: ["UserA", "UserB"]});
});