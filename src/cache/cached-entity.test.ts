import User from "../auth/user.entity";
import {EM} from "../orm";

test("referred entity should remain initialized when cached", async() => {
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