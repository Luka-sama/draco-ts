import User from "../auth/user.entity";
import ORM, {EM} from "./orm";

/*
Each flush in MikroORM (including auto-flush) clears the persist stack (in postCommitCleanup).
MikroORM itself adds entities to the identity map only if they were found per EM.find or if they were changed.
That means that MikroORM "forgets" the entity (doesn't track the changes anymore) if it was persisted with EM.persist
and wasn't changed/found.
Therefore, ORM.register should be used instead of EM.persist as it adds the entity directly to the identity map
(if it is cached and fully loaded, otherwise it calls EM.persist).
*/
test("ORM.register", async function() {
	const someUser = await User.getOrFail(2);
	EM.clear();
	ORM.register(someUser); // Doesn't work with EM.persist instead of ORM.register
	await EM.flush();
	const uow = EM.getUnitOfWork();
	const isEntityManaged = uow.getPersistStack().has(someUser) || uow.getIdentityMap().values().includes(someUser);
	expect(isEntityManaged).toBeTruthy();
});