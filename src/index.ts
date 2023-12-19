import Account from "./auth/account.entity.js";
import User from "./auth/user.entity.js";
import Chat from "./chat/chat.js";
import App from "./draco-ts/app.js";
import Cache from "./draco-ts/cache/cache.js";
import Task from "./draco-ts/game-loop/task.js";
import Session from "./draco-ts/net/session.js";
import Magic from "./magic/magic.js";
import Zone from "./map/zone.js";

export default class Index {
	public static async init(): Promise<void> {
		await App.init();
		Session.setAllowedEntities([Account, User]);
		//Deploy.init();
		Index.addGlobalTasks();
	}

	public static addGlobalTasks(): void {
		Task.create(Magic.moveAllLightsGroups);
		Task.create(Magic.removeLightsFromQueue);
		Task.create(Chat.sendTime);
		Task.create(Zone.stayInCacheIfSomebodyIsOnline, {frequency: Cache.CLEAN_FREQUENCY / 2});
	}
}

Index.init();