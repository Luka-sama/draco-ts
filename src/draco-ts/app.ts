import Cache from "./cache/cache.js";
import GameLoop from "./core/game-loop.js";
import Logger, {LogLevel} from "./core/logger.js";
import Tr from "./core/tr.js";
import WS from "./net/ws.js";
import DB from "./orm/db.js";
import ORM from "./orm/orm.js";
import Synchronizer from "./sync/sync.js";
import TypeAnalyzer from "./type-analyzer/type-analyzer.js";

/** Framework configuration. It is recommended to leave default settings, unless you know what you are doing. */
export interface AppConfig {
	/** Specifies the number of lines in a Node.js stack trace that is generated in case of errors */
	errorStackTraceLimit: number,
	/** Runs game loop every `tickFrequency` ms. It makes no sense to set other frequencies lower than tickFrequency */
	tickFrequency: number;
	/**
	 * Flush all log entries to the files every `loggerFlushFrequency` ms.
	 * This parameter only has an impact if `LOG_DESTINATION` is set `file` (see {@link Logger} for details).
	 * The log entries to the console will be always flushed immediately.
	 */
	loggerFlushFrequency: number;
	/** Flush all updates to the database every `dbFlushFrequency` ms */
	dbFlushFrequency: number;
	/** Sync all updates with clients every `syncFrequency` ms */
	syncFrequency: number;
}

/** App class. App log level is by default `info`, unless you change it with `APP_LOG_LEVEL`, see {@link Logger} */
export default class App {
	private static logger = new Logger(App, LogLevel.Info);
	private static defaultConfig: AppConfig = {
		errorStackTraceLimit: 50,
		tickFrequency: 16,
		loggerFlushFrequency: 100,
		dbFlushFrequency: 100,
		syncFrequency: 100,
	};
	private static started = false;

	/** Initializes all core components (ORM, WS, GameLoop, etc.) */
	public static init(userConfig: Partial<AppConfig> = {}): void {
		if (App.started) {
			App.logger.warn("Tried to start the application that is already started.");
			return;
		}
		const config: AppConfig = {...App.defaultConfig, ...userConfig};

		// First we should start gameloop, (error) logging and prepare TypeAnalyzer for use
		Error.stackTraceLimit = config.errorStackTraceLimit;
		process.on("uncaughtException", App.logger.error);
		process.on("unhandledRejection", App.logger.error);
		GameLoop.init(config.tickFrequency);
		GameLoop.addTask(Logger.flush, userConfig.loggerFlushFrequency);
		TypeAnalyzer.init();

		// Then we can start other modules
		Tr.init();
		DB.init();
		ORM.enableSync();
		GameLoop.addTask(ORM.flush, config.dbFlushFrequency);
		WS.init();
		GameLoop.addTask(Cache.clean, Cache.CLEAN_FREQUENCY);
		GameLoop.addTask(Synchronizer.synchronize, config.syncFrequency);
		GameLoop.addTask(Synchronizer.syncNewZones);

		// We don't need megabytes of collected data anymore
		TypeAnalyzer.stop();

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
		Tr.stop();

		process.off("uncaughtException", App.logger.error);
		process.off("unhandledRejection", App.logger.error);
		App.started = false;
		App.logger.info("Stopped.");
	}

	/** Returns whether the application is started */
	public static isStarted(): boolean {
		return App.started;
	}
}