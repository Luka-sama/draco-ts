import "dotenv/config";
import {mock, mockReset} from "jest-mock-extended";
import Account from "./auth/account.entity.js";
import {LoggedArgs} from "./auth/auth.decorator.js";
import User from "./auth/user.entity.js";
import Cache from "./draco-ts/cache/cache.js";
import ORM from "./draco-ts/orm/orm.js";
import Tr from "./draco-ts/tr.js";
import {GuestArgs, Socket} from "./draco-ts/ws.js";
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
	ORM.init();
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
	ORM.clear();
	Cache.clear();
	//account.cache();
	//user.cache();
});