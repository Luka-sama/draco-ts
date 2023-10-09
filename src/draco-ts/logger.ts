import assert from "assert/strict";
import fs from "fs/promises";
import _ from "lodash";
import path from "path";
import util from "util";
import MapUtil from "./util/map-util.js";

export enum LogDestination {Console, File}
export enum LogLevel {Debug, Info, Warn, Error, Silent}

export class NotLoggableError extends Error {
	public name = "NotLoggableError";
}

/**
 * Logger class. It can be used to log any info or errors to the console or the files.
 *
 * Typically you want to use it like so:
 * ```ts
 * export default class YourClassName {
 *  private static readonly logger = new Logger(YourClassName);`
 * }
 * ```
 *
 * Then you can call `YourClassName.logger.info("some info");`
 * or use it somewhere like `something.on("error", YourClassName.logger.error);`.
 *
 * The logger will read environment variable `LOG_DESTINATION` (possible values are `console` or `file`)
 * to determine whether it should write to the console or the files. In the second case, a separate file for each component is created.
 * You can specify their location with `LOG_DIR=logs/`.
 *
 * You can also control the log levels with environment variables. An example how and what you can control in .env-file:
 * ```
 * LOG_DESTINATION=file
 * LOG_DIR=logs/
 * DEFAULT_LOG_LEVEL=warn
 * YOUR_CLASS_LOG_LEVEL=debug
 * ```
 *
 * The possible values for log levels are `debug`, `info`, `warn`, `error` or `silent`.
 * You can specify the default log level or the log level for a specific component (see also {@link Logger.constructor}),
 * e.g. `WS_LOG_LEVEL=info` will log all communication between the server and the client.
 * If you specify `WS_LOG_LEVEL=debug`, the events for unconnected users will also be logged.
 * App log level is by default `info`, unless you change it with `APP_LOG_LEVEL`.
 */
export default class Logger {
	public static readonly FLUSH_FREQUENCY = 100;
	private static readonly LOG_DIR = (process.env.LOG_DIR ? process.env.LOG_DIR : "logs/");
	private static LOG_DESTINATION = (process.env.LOG_DESTINATION == "file" ? LogDestination.File : LogDestination.Console);
	private static entries = new Map<string, string[]>;
	private readonly component: string;
	private level = LogLevel.Warn;

	/** Sets log destination. See {@link LogDestination} */
	public static setDestination(destination: LogDestination): void {
		Logger.LOG_DESTINATION = destination;
	}

	/** Flushes all log entries to the files, if {@link Logger.LOG_DESTINATION} is set to {@link LogDestination.File} */
	public static async flush(): Promise<void> {
		if (Logger.LOG_DESTINATION != LogDestination.File) {
			return;
		}

		for (const [component, texts] of Logger.entries) {
			const text = texts.join("\n") + "\n";
			await fs.appendFile(path.join(Logger.LOG_DIR, `${_.snakeCase(component)}.txt`), text);
		}
		Logger.entries.clear();
	}

	/**
	 * Creates a logger for the given component.
	 * The component can be a string or a function (incl. classes), in the second case the name of the function will be used.
	 *
	 * The logger will use the first specified log level, based on this order:
	 * - Environment variable THIS_COMPONENT_LOG_LEVEL. Use {@link Logger.setLevel}, if you want to override this
	 * - Second constructor argument
	 * - Environment variable DEFAULT_LOG_LEVEL
	 * - Log level `warn`
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	public constructor(component: string | Function, level?: LogLevel) {
		this.component = (typeof component == "string" ? component : component.name);
		assert(this.component.length > 0);

		const defaultLogLevel = process.env.DEFAULT_LOG_LEVEL;
		const customLevelStr = process.env[_.snakeCase(this.component).toUpperCase() + "_LOG_LEVEL"];
		const levelStr = (customLevelStr || defaultLogLevel || "").toLowerCase();
		if (level && !customLevelStr) {
			this.level = level;
		} else if (levelStr == "debug") {
			this.level = LogLevel.Debug;
		} else if (levelStr == "info") {
			this.level = LogLevel.Info;
		} else if (levelStr == "warn") {
			this.level = LogLevel.Warn;
		} else if (levelStr == "error") {
			this.level = LogLevel.Error;
		}

		this.debug = this.debug.bind(this);
		this.info = this.info.bind(this);
		this.warn = this.warn.bind(this);
		this.error = this.error.bind(this);
	}

	/** Gets the logger level */
	public getLevel(): LogLevel {
		return this.level;
	}

	/** Sets the logger level */
	public setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Logs a message at the given level, if the message level reaches the level of this logger
	 * (e.g. `debug` will not be logged in the logger with level `warn`).
	 * It logs also the datetime, the component name and the level of the message.
	 *
	 * `content` can be of any type. If it is an error that extends NotLoggableError, it will not be logged.
	 *
	 * If {@link Logger.LOG_DESTINATION} is set to {@link LogDestination.Console}, it will write directly to the console,
	 * otherwise the entries will be collected and periodically flushed to the files.
	 */
	public log(level: Exclude<LogLevel, LogLevel.Silent>, content: unknown): void {
		if (level < this.level || content instanceof NotLoggableError) {
			return;
		}

		const datetime = Logger.getDatetime();
		const levelString = ["DEBUG", "INFO", "WARN", "ERROR"][level];
		const contentString = util.format(content);
		const text = `[${datetime}] ${this.component} ${levelString}: ${contentString}`;
		if (Logger.LOG_DESTINATION == LogDestination.Console) {
			Logger.logToConsole(level, text);
		} else {
			MapUtil.getArray(Logger.entries, this.component).push(text);
		}
	}

	/** Logs a debug information. Shortcut for {@link Logger.log} with the level {@link LogLevel.Debug} */
	public debug(content: unknown): void {
		this.log(LogLevel.Debug, content);
	}

	/** Logs an information. Shortcut for {@link Logger.log} with the level {@link LogLevel.Info} */
	public info(content: unknown): void {
		this.log(LogLevel.Info, content);
	}

	/** Logs a warning. Shortcut for {@link Logger.log} with the level {@link LogLevel.Warn} */
	public warn(content: unknown): void {
		this.log(LogLevel.Warn, content);
	}

	/** Logs an error. Shortcut for {@link Logger.log} with the level {@link LogLevel.Error} */
	public error(content: unknown): void {
		this.log(LogLevel.Error, content);
	}

	/** Returns current datetime as a string */
	private static getDatetime(): string {
		const now = new Date;
		const year = _.padStart(now.getFullYear().toString(), 2, "0");
		const month = _.padStart((now.getMonth() + 1).toString(), 2, "0");
		const date = _.padStart(now.getDate().toString(), 2, "0");
		const hours = _.padStart(now.getHours().toString(), 2, "0");
		const minutes = _.padStart(now.getMinutes().toString(), 2, "0");
		const seconds = _.padStart(now.getSeconds().toString(), 2, "0");
		const milliseconds = _.padStart(now.getMilliseconds().toString(), 3, "0");
		return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}.${milliseconds}`;
	}

	/** Logs a message to the console at the given level */
	private static logToConsole(level: LogLevel, message: string): void {
		if (level == LogLevel.Debug || level == LogLevel.Info) {
			console.log(message);
		} else if (level == LogLevel.Warn || level == LogLevel.Error) {
			console.error(message);
		}
	}
}