import assert from "assert/strict";
import "dotenv/config";
import fs from "fs/promises";
import _ from "lodash";
import path from "path";
import util from "util";
import MapUtil from "./collection-utils/map-util.js";

export enum LogDestination {Console, File}
export enum LogLevel {Debug, Info, Warn, Error, Silent}

/**
 * Logger class. It can be used to log any info or errors to the console or the files.
 *
 * Typically, you want to use it like so:
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
 * to determine whether it should write to the console or the files.
 * In the second case, a separate file for each component is created.
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
 * You can specify the default log level or the log level for a specific component,
 * e.g. `WS_LOG_LEVEL=info` will log all communication between the server and the client.
 * If you specify `WS_LOG_LEVEL=debug`, the events for unconnected users will also be logged.
 *
 * The logger will use the first specified log level, based on this order:
 * - Environment variable THIS_COMPONENT_LOG_LEVEL
 * - Second constructor argument
 * - Environment variable DEFAULT_LOG_LEVEL
 * - Log level `warn`
 * You can also update the environment variables at runtime to change the log level on the fly.
 */
export default class Logger {
	private static entries = new Map<string, string[]>;
	private readonly component: string;
	private level?: LogLevel;

	/** Flushes all log entries to the files, if `LOG_DESTINATION` is set to `file` */
	public static async flush(): Promise<void> {
		if (Logger.entries.size < 1) {
			return;
		}

		const logDir = (process.env.LOG_DIR ? process.env.LOG_DIR : "logs/");
		await fs.mkdir(logDir, {recursive: true});

		for (const [component, texts] of Logger.entries) {
			const text = texts.join("\n") + "\n";
			await fs.appendFile(path.join(logDir, `${_.snakeCase(component)}.txt`), text);
		}
		Logger.entries.clear();
	}

	/**
	 * Creates a logger for the given component.
	 * The component can be a string or a function (incl. classes), in the second case the function name will be used.
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	public constructor(component: string | Function, level?: LogLevel) {
		this.component = (typeof component == "string" ? component : component.name);
		assert(this.component.length > 0);
		this.level = level;
		this.debug = this.debug.bind(this);
		this.info = this.info.bind(this);
		this.warn = this.warn.bind(this);
		this.error = this.error.bind(this);
	}

	/** Gets the logger level */
	public getLevel(): LogLevel {
		const envLevelStr = (process.env[_.snakeCase(this.component).toUpperCase() + "_LOG_LEVEL"] || "").toLowerCase();
		const defaultLogLevel = (process.env.DEFAULT_LOG_LEVEL || "").toLowerCase();
		if (envLevelStr) {
			return Logger.strToLevel(envLevelStr);
		} else if (this.level !== undefined) {
			return this.level;
		} else if (defaultLogLevel) {
			return Logger.strToLevel(defaultLogLevel);
		}
		return LogLevel.Warn;
	}

	/**
	 * Sets the logger level.
	 * If process environment variable for this component is specified, this method will have no visible effect.
	 */
	public setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Logs a message at the given level, if the message level reaches the level of this logger
	 * (e.g. `debug` will not be logged in the logger with level `warn`).
	 * It logs also the datetime, the component name and the level of the message.
	 *
	 * `content` can be of any type. It will be logged using `util.format`.
	 *
	 * If `LOG_DESTINATION` is set to `console` (by default), it will write directly to the console,
	 * otherwise the entries will be collected and periodically flushed to the files.
	 */
	public log(level: Exclude<LogLevel, LogLevel.Silent>, content: unknown): void {
		if (level < this.getLevel()) {
			return;
		}

		const datetime = Logger.getDatetime();
		const levelString = ["DEBUG", "INFO", "WARN", "ERROR"][level];
		const contentString = util.format(content);
		const text = `[${datetime}] ${this.component} ${levelString}: ${contentString}`;
		if (process.env.LOG_DESTINATION == "file") {
			MapUtil.getArray(Logger.entries, this.component).push(text);
		} else {
			Logger.logToConsole(level, text);
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

	/** Convert a string to enum {@link LogLevel}, e.g. "debug" to {@link LogLevel.Debug} */
	private static strToLevel(levelStr: string): LogLevel {
		if (levelStr == "debug") {
			return LogLevel.Debug;
		} else if (levelStr == "info") {
			return LogLevel.Info;
		} else if (levelStr == "warn") {
			return LogLevel.Warn;
		} else if (levelStr == "error") {
			return LogLevel.Error;
		} else if (levelStr == "silent") {
			return LogLevel.Silent;
		}
		throw new Error(`Unexpected level string ${levelStr}.`);
	}
}