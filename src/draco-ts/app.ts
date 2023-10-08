import {glob} from "glob";
import Cache from "./cache/cache.js";
import GameLoop from "./game-loop.js";
import Logger, {LogLevel} from "./logger.js";
import ORM from "./orm/orm.js";
import Synchronizer from "./sync/sync.js";
import Tr from "./tr.js";
import WS from "./ws.js";

/** App class */
export default class App {
	private static logger = new Logger(App);
	private static started = false;

	/** Initializes all core components (ORM, WS, GameLoop, etc.) */
	static async init(): Promise<void> {
		if (App.started) {
			return;
		}
		App.started = true;
		App.logger.setLevel(LogLevel.Info);
		Error.stackTraceLimit = 100;
		process.on("uncaughtException", App.logger.error);
		process.on("unhandledRejection", App.logger.error);

		Tr.init();
		ORM.init();
		ORM.enableSync();
		GameLoop.init();
		WS.init();
		App.addGlobalTasks();
		await App.autoimport();

		App.logger.info("Started.");
	}

	/** Adds all core global tasks from different modules */
	private static addGlobalTasks() {
		GameLoop.addTask(Cache.clean, Cache.CLEAN_FREQUENCY);
		GameLoop.addTask(Synchronizer.synchronize, Synchronizer.FREQUENCY);
		GameLoop.addTask(Synchronizer.syncNewZones);
		GameLoop.addTask(ORM.flush, ORM.FLUSH_FREQUENCY);
		GameLoop.addTask(Logger.flush, Logger.FLUSH_FREQUENCY);
	}

	/** Auto-import to make @OnlyLogged() and other decorators to work without explicit import */
	private static async autoimport(): Promise<void> {
		const ignore = [
			"**/*.entity.js", "**/*.test.js", "**/*.typings.js",
			"seeder.js", "jest-setup.js"
		];
		const files = await glob("./**/*.js", {ignore, cwd: "./dist"});
		await Promise.all(files.map(file => import(`../${file}`)));
	}
}