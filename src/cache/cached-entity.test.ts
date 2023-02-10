import Account from "../auth/account.entity.js";
import User from "../auth/user.entity.js";
import {EM} from "../core/orm.js";
import Item from "../item/item.entity.js";
import Location from "../map/location.entity.js";
import {Vec2} from "../util/vector.embeddable.js";

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

// See also constructor for fix details
test("populating of not loaded cached entities should not cause changes in DB", async () => {
	await User.getOrFail(2);
	EM.clear();
	const location = await Location.getOrFail(1);
	const uow = EM.getUnitOfWork();
	uow.computeChangeSets();
	const changeSets = uow.getChangeSets();
	expect(changeSets).toEqual([]);
	expect(location.name).toBe("world");
});

/**
 * CachedEntity should save collections in a hidden property, otherwise MikroORM removes them.
 * See getInstance and setInternalProps for fix details.
 * See {@link https://github.com/mikro-orm/mikro-orm/blob/4025869c/packages/core/src/entity/EntityFactory.ts#L202-L204}
 * and {@link https://github.com/mikro-orm/mikro-orm/issues/2406} for details why MikroORM removes collections.
 */
test("collections should work for cached entities", async () => {
	const item1 = await EM.findOneOrFail(Item, {id: 1});
	expect(item1.type.shape).toBeUndefined();
	EM.clear();
	const item2 = await EM.findOneOrFail(Item, {id: 1}, {populate: true});
	expect(item2.type.shape.length).toBe(3);
	EM.clear();
	const item3 = await EM.findOneOrFail(Item, {position: Vec2(10, 20)});
	expect(item3.type.shape.length).toBe(3);
});