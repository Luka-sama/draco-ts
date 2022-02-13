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
	// eslint-disable-next-line no-var
	var account: Account;
	// eslint-disable-next-line no-var
	var user: User;
}
global.sck = mock<Socket>();
global.guestArgs = {sck, raw: {}};

beforeAll(async () => {
	Cache.init();
	await ORM.init({allowGlobalContext: true});
	sck.account = global.account = await Account.getOrFail(1);
	sck.user = global.user = await User.getOrFail(1);
	global.loggedArgs = {...guestArgs, user};
}, 15000);

afterAll(async () => {
	await ORM.getInstance().close();
});

beforeEach(() => {
	mockReset(sck);
	EM.clear();
	Cache.clear();
	account.cache();
	user.cache();
});