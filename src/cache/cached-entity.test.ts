import Account from "../auth/account.entity";
import User from "../auth/user.entity";
import {EM} from "../core/orm";

test("it should work", async () => {
	const user = await User.getOrFail(1);
	const acc1 = user.account;
	const acc2 = await EM.findOne(Account, {id: acc1.id});
	expect(acc1).toBe(acc2);
});

test("referred entity should remain initialized when cached", async () => {
	const user1 = await EM.findOneOrFail(User, {name: "Luka"});
	// Now (if we have bug) user.account.__helper.__initialized == false
	EM.clear();
	const user2 = await EM.findOneOrFail(User, {name: "Luka"});
	// Now (if we have bug) account properties are undefined
	expect(account.name).toBe("Luka-sama");
	expect(user1.account).toBe(account);
	expect(user2.account).toBe(account);
	expect(user1).toBe(user2);
});