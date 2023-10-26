import "dotenv/config";
import {glob} from "glob";
import Session from "./auth/session.js";
import Chat from "./chat/chat.js";
import App from "./draco-ts/app.js";
import Cache from "./draco-ts/cache/cache.js";
import GameLoop from "./draco-ts/core/game-loop.js";
import Magic from "./magic/magic.js";
import Zone from "./map/zone.js";

export default class Index {
	public static async init() {
		App.init();
		Session.init();
		//Deploy.init();
		Index.addGlobalTasks();
		await Index.autoimport();
	}

	public static addGlobalTasks() {
		GameLoop.addTask(Magic.moveAllLightsGroups);
		GameLoop.addTask(Magic.removeLightsFromQueue);
		GameLoop.addTask(Chat.sendTime);
		GameLoop.addTask(Zone.stayInCacheIfSomebodyIsOnline, Cache.CLEAN_FREQUENCY / 2);
	}

	/** Auto-import to make @OnlyLogged() and other decorators to work without explicit import */
	private static async autoimport(): Promise<void> {
		const ignore = [
			"**/*.entity.js", "**/*.test.js", "**/*.typings.js",
			"seeder.js", "jest-setup.js"
		];
		const files = await glob("./**/*.js", {ignore, cwd: "./dist"});
		await Promise.all(files.map(file => import(`./${file}`)));
	}
}

Index.init();