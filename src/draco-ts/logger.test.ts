import Logger, {LogDestination, LogLevel} from "./logger.js";

test("log levels", () => {
	Logger.setDestination(LogDestination.Console);
	process.env.DEFAULT_LOG_LEVEL = "warn";
	const consoleLog = jest.spyOn(console, "log").mockImplementation();
	const consoleError = jest.spyOn(console, "error").mockImplementation();

	const logger = new Logger("my_logger");
	logger.info("some info");
	expect(consoleLog).toHaveBeenCalledTimes(0);
	expect(consoleError).toHaveBeenCalledTimes(0);
	logger.warn("some warn");
	expect(consoleLog).toHaveBeenCalledTimes(0);
	expect(consoleError).toHaveBeenCalledTimes(1);
	logger.error("some error");
	expect(consoleLog).toHaveBeenCalledTimes(0);
	expect(consoleError).toHaveBeenCalledTimes(2);
	logger.setLevel(LogLevel.Debug);
	logger.debug("some debug");
	expect(consoleLog).toHaveBeenCalledTimes(1);
	expect(consoleError).toHaveBeenCalledTimes(2);
});