import {mock, mockReset} from "jest-mock-extended";
import {EM, Socket} from "../ws";
import Auth from "./auth";

const em = mock<EM>();
const sck = mock<Socket>();
beforeEach(() => {
	mockReset(em);
	mockReset(sck);
});

test("signUpAccount", async() => {
	await Auth.signUpAccount({sck, em, raw: {}});
	expect(sck.emit).toHaveBeenCalledWith("sign_up_account_errors", {errors: expect.any(Array)});
});

test("getUserList", async() => {
	em.find.mockResolvedValueOnce([{id: 1, name: "UserA"}, {id: 2, name: "UserB"}]);
	await Auth.getUserList({sck, em, raw: {}});
	expect(sck.emit).toHaveBeenCalledWith("get_user_list", {list: ["UserA", "UserB"]});
});