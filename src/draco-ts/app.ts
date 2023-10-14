import Cache from "./cache/cache.js";
import GameLoop from "./game-loop.js";
import Logger, {LogLevel} from "./logger.js";
import DB from "./orm/db.js";
import ORM from "./orm/orm.js";
import Synchronizer from "./sync/sync.js";
import Tr from "./tr.js";
import WS from "./ws.js";

/** App class. App log level is by default `info`, unless you change it with `APP_LOG_LEVEL`, see {@link Logger} */
export default class App {
	private static logger = new Logger(App, LogLevel.Info);
	private static starting = false;
	private static started = false;

	/** Initializes all core components (ORM, WS, GameLoop, etc.) */
	public static init(): void {
		if (App.starting || App.started) {
			App.logger.warn("Tried to start the application that is already starting or started.");
			return;
		}
		App.starting = true;

		Error.stackTraceLimit = 100;
		process.on("uncaughtException", App.logger.error);
		process.on("unhandledRejection", App.logger.error);

		Tr.init();
		DB.init();
		ORM.enableSync();
		WS.init();
		GameLoop.init();

		GameLoop.addTask(Logger.flush, Logger.FLUSH_FREQUENCY);
		GameLoop.addTask(ORM.flush, ORM.FLUSH_FREQUENCY);
		GameLoop.addTask(Cache.clean, Cache.CLEAN_FREQUENCY);
		GameLoop.addTask(Synchronizer.synchronize, Synchronizer.FREQUENCY);
		GameLoop.addTask(Synchronizer.syncNewZones);

		App.starting = false;
		App.started = true;
		App.logger.info("Started.");
	}

	/** Stops the application. You can then use {@link App.init} to start it again */
	public static async stop(): Promise<void> {
		if (!App.started) {
			App.logger.warn("Tried to stop the application that is already stopped or was not started.");
			return;
		}
		GameLoop.stop();
		WS.close();
		ORM.disableSync();
		await DB.close();

		process.off("uncaughtException", App.logger.error);
		process.off("unhandledRejection", App.logger.error);
		App.started = false;
		App.logger.info("Stopped.");
	}

	/** Returns whether the application is in the process of starting */
	public static isStarting(): boolean {
		return App.starting;
	}

	/** Returns whether the application is started */
	public static isStarted(): boolean {
		return App.started;
	}
}