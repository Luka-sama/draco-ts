import assert from "assert/strict";
import {mock, test} from "node:test";
import Logger, {LogLevel} from "./logger.js";

test("log levels", () => {
	process.env.LOG_DESTINATION = "console";
	process.env.DEFAULT_LOG_LEVEL = "warn";
	const consoleLog = mock.method(console, "log");
	const consoleError = mock.method(console, "error");
	consoleLog.mock.mockImplementation(() => {});
	consoleError.mock.mockImplementation(() => {});

	const logger = new Logger("my_logger");
	logger.info("some info");
	assert.equal(consoleLog.mock.callCount(), 0);
	assert.equal(consoleError.mock.callCount(), 0);

	logger.warn("some warn");
	assert.equal(consoleLog.mock.callCount(), 0);
	assert.equal(consoleError.mock.callCount(), 1);

	logger.error("some error");
	assert.equal(consoleLog.mock.callCount(), 0);
	assert.equal(consoleError.mock.callCount(), 2);

	logger.setLevel(LogLevel.Debug);
	logger.debug("some debug");
	assert.equal(consoleLog.mock.callCount(), 1);
	assert.equal(consoleError.mock.callCount(), 2);

	process.env.MY_LOGGER_LOG_LEVEL = "silent";
	logger.error("some error");
	assert.equal(consoleLog.mock.callCount(), 1);
	assert.equal(consoleError.mock.callCount(), 2);
});