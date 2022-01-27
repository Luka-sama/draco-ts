import {EntityManager} from "@mikro-orm/postgresql";
import {mock, mockReset} from "jest-mock-extended";
import {Socket} from "../ws";
import Auth from "./auth";

const em = mock<EntityManager>();
const sck = mock<Socket>();
beforeEach(() => {
	mockReset(em);
	mockReset(sck);
});

test("signUpAccount", async() => {
	await Auth.signUpAccount({sck, raw: {}});
	expect(sck.emit).toHaveBeenCalledWith("sign_up_account_errors", {errors: expect.any(Array)});
});

test("getUserList", async() => {
	em.find.mockResolvedValueOnce([{id: 1, name: "UserA"}, {id: 2, name: "UserB"}]);
	await Auth.getUserList({sck, raw: {}});
	expect(sck.emit).toHaveBeenCalledWith("get_user_list", {list: ["UserA", "UserB"]});
});