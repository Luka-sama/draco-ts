import {mock, mockReset} from "jest-mock-extended";
import Account from "./auth/account.entity";
import User from "./auth/user.entity";
import Cache from "./cache/cache";
import ORM, {EM} from "./orm";
import {GuestArgs, LoggedArgs, Socket} from "./ws.typings";

declare global {
	// eslint-disable-next-line no-var
	var sck: Socket;
	// eslint-disable-next-line no-var
	var guestArgs: GuestArgs;
	// eslint-disable-next-line no-var
	var loggedArgs: LoggedArgs;
}
global.sck = mock<Socket>();
global.guestArgs = {sck, raw: {}};

beforeAll(async () => {
	Cache.init();
	await ORM.init({allowGlobalContext: true});
	sck.account = await Account.getOrFail(1);
	const user = await User.getOrFail(1);
	global.loggedArgs = {...guestArgs, user};
});

afterAll(async () => {
	await ORM.getInstance().close();
});

beforeEach(() => {
	mockReset(sck);
	EM.clear();
});