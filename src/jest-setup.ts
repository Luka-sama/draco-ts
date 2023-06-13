import {mock, mockReset} from "jest-mock-extended";
import Account from "./auth/account.entity.js";
import User from "./auth/user.entity.js";
import Cache from "./cache/cache.js";
import ORM, {EM} from "./core/orm.js";
import Tr from "./core/tr.js";
import {GuestArgs, LoggedArgs, Socket} from "./core/ws.typings.js";
import Zone from "./map/zone.js";

/* eslint-disable no-var */
declare global {
	var sck: Socket;
	var guestArgs: GuestArgs;
	var loggedArgs: LoggedArgs;
	var account: Account;
	var user: User;
	var zone: Zone;
}
/* eslint-enable */
global.sck = mock<Socket>();
global.guestArgs = {sck, raw: {}};

Tr.init(true);

beforeAll(async () => {
	await ORM.init({allowGlobalContext: true});
	sck.account = global.account = await Account.getOrFail(1);
	sck.user = global.user = await User.getOrFail(1);
	global.zone = await Zone.getByEntity(user);
	global.loggedArgs = {...guestArgs, user, zone};
}, 15000);

afterAll(async () => {
	await ORM.close();
});

beforeEach(() => {
	mockReset(sck);
	EM.clear();
	Cache.clear();
	account.cache();
	user.cache();
});