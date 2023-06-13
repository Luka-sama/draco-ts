import {RequestContext} from "@mikro-orm/core";
import {glob} from "glob";
import Cache from "../cache/cache.js";
import Magic from "../magic/magic.js";
import Deploy from "../map/deploy.js";
import Const from "../util/const.js";
import GameLoop from "./game-loop.js";
import ORM, {EM} from "./orm.js";
import Synchronizer from "./sync.js";
import Tr from "./tr.js";
import WS from "./ws.js";

/** App class */
export default class App {
	private static started = false;

	/** Initializes all components (Cache, ORM, WS etc) */
	static async init(): Promise<void> {
		if (App.started) {
			return;
		}
		App.started = true;

		App.catchExceptions();
		Tr.init();
		await App.autoimport();
		await ORM.init();
		GameLoop.init();
		WS.init();
		Deploy.init();
		App.addGlobalTasks();
		await RequestContext.createAsync(EM, async function() {
			await Magic.init();
		});
		/*await RequestContext.createAsync(EM, async function() {
			await Magic.createLightsForAll();
			await EM.flush();
		});*/
	}

	private static addGlobalTasks() {
		GameLoop.addTask(Cache.clean, Const.CACHE_CLEAN_FREQUENCY_MS);
		GameLoop.addTask(Synchronizer.synchronize, Const.SYNC_FREQUENCY_MS);
		GameLoop.addTask(Magic.moveAllLightsGroups);
	}

	/** Auto-import to make @OnlyLogged() and other decorators to work without explicit import */
	private static async autoimport(): Promise<void> {
		const ignore = [
			"**/*.entity.js", "**/*.test.js", "**/*.typings.js",
			"seeder.js", "jest-setup.js",
		];
		const files = await glob("./**/*.js", {ignore, cwd: "./dist"});
		for (const file of files) {
			await import(`../${file}`);
		}
	}

	/** Catches uncaught exceptions and unhandled rejections */
	private static catchExceptions(): void {
		Error.stackTraceLimit = 100;

		process.on("uncaughtException", error => {
			console.error(`Uncaught exception [${new Date()}]:\r\n${error.stack}`);
		});

		process.on("unhandledRejection", (error: Error) => {
			console.error(`Unhandled rejection [${new Date()}]:\r\n${error?.stack ? error.stack : error}`);
		});
	}
}