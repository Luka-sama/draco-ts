import "dotenv/config";
import Session from "./auth/session.js";
import Chat from "./chat/chat.js";
import App from "./draco-ts/app.js";
import Cache from "./draco-ts/cache/cache.js";
import GameLoop from "./draco-ts/game-loop.js";
import Magic from "./magic/magic.js";
import Zone from "./map/zone.js";

class Index {
	static async init() {
		await App.init();
		Session.init();
		//Deploy.init();
		Index.addGlobalTasks();
	}

	static addGlobalTasks() {
		GameLoop.addTask(Magic.moveAllLightsGroups);
		GameLoop.addTask(Magic.removeLightsFromQueue);
		GameLoop.addTask(Chat.sendTime);
		GameLoop.addTask(Zone.stayInCacheIfSomebodyIsOnline, Cache.CLEAN_FREQUENCY / 2);
	}
}

Index.init();