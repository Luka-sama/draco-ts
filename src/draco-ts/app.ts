import Cache from "./cache/cache.js";
import GameLoop from "./game-loop/game-loop.js";
import Task from "./game-loop/task.js";
import Logger, {LogLevel} from "./logger.js";
import ProtobufLoader from "./net/protobuf-loader.js";
import Protobuf from "./net/protobuf.js";
import WS from "./net/ws.js";
import DB from "./orm/db.js";
import ORM from "./orm/orm.js";
import Synchronizer from "./sync/sync.js";
import Tr from "./tr.js";
import ClassLoader from "./type-analyzer/class-loader.js";
import TypeAnalyzer from "./type-analyzer/type-analyzer.js";
import {Typings} from "./typings.js";

/** Framework configuration. It is recommended to leave default settings, unless you know what you are doing. */
export interface AppConfig {
	/** Specifies the number of lines in a Node.js stack trace that is generated in case of errors */
	errorStackTraceLimit: number;
	/**
	 * Runs game loop every `tickFrequency` ms. It makes no sense to set other frequencies lower than `tickFrequency`.
	 * If you set `tickFrequency` to a higher value, the server and network load will be less,
	 * but the ping will also be higher, i.e. the user will have the higher latency.
	 */
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
	/**
	 * The opcode size in bytes.
	 * The larger, the more message and service classes can be created, but more bytes are sent per message.
	 * By default 2 bytes, this means the limit of 65535 messages and services.
	 * This should be enough for the vast majority of games.
	 */
	opcodeSize: number;
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
		opcodeSize: 2,
	};
	private static started = false;

	/** Initializes all core components (ORM, WS, GameLoop, etc.) */
	public static async init(userConfig: Partial<AppConfig> = {}): Promise<void> {
		if (App.started) {
			App.logger.warn("Tried to start the application that is already started.");
			return;
		}
		const config: AppConfig = {...App.defaultConfig, ...userConfig};

		// First we should start gameloop and (error) logging
		Error.stackTraceLimit = config.errorStackTraceLimit;
		process.on("uncaughtException", App.logger.error);
		process.on("unhandledRejection", App.logger.error);
		GameLoop.init(config.tickFrequency);
		Task.create(Logger.flush, {frequency: config.loggerFlushFrequency});

		// Then we collect the data using TypeAnalyzer and use it
		TypeAnalyzer.init();
		const typings = await ClassLoader.findOrThrow(Typings);
		const {types, messages, services} = await ProtobufLoader.loadAllProtoClasses();
		Protobuf.init(types, messages, services, config.opcodeSize, typings);
		// We don't need megabytes of collected data anymore
		TypeAnalyzer.stop();

		// Then we can start other modules
		Tr.init();
		DB.init();
		ORM.enableSync();
		Task.create(ORM.flush, {frequency: config.dbFlushFrequency});
		WS.init();
		Task.create(Cache.clean, {frequency: Cache.CLEAN_FREQUENCY});
		// With priority 1, so that users get changes immediately rather than on the next game loop iteration
		Task.create(Synchronizer.synchronize, {frequency: config.syncFrequency, priority: 1});
		Task.create(Synchronizer.syncNewZones);

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