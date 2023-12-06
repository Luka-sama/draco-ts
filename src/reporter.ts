import _ from "lodash";
import {TestEvent} from "node:test/reporters";
import path from "path";
import util from "util";

export default async function*(source: TestEvent[]): AsyncGenerator<string, void> {
	// https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
	const MODIFY = `\x1b[`;
	const CYAN = `${MODIFY}36m`;
	const BRIGHT_RED = `${MODIFY}91m`;
	const BRIGHT_GREEN = `${MODIFY}92m`;
	const RESET = `${MODIFY}0m`;
	const ERASE_LAST_LINE = `\x1b[1A \x1b[2K\r`;
	const EXPERIMENTAL_WARNING = (
		"ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time\n"
	);
	const WARNING_HINT = (
		"(Use `node --trace-warnings ...` to show where the warning was created)\n"
	);
	const getFilePath = (file?: string) => (file ? path.relative(path.dirname(import.meta.url), file) : "");
	let isFirstDiagnostic = true;

	let lastFile = "";
	let totalDuration = 0;
	let totalTests = 0;
	let failed = false;
	for await (const event of source) {
		if (event.type == "test:pass" && event.data.details.type != "suite") {
			const file = getFilePath(event.data.file);
			if (lastFile == file) {
				if (failed) {
					continue;
				}
				yield `${ERASE_LAST_LINE}`;
			} else {
				failed = false;
				totalDuration = 0;
				totalTests = 0;
			}
			lastFile = file;
			totalDuration += event.data.details.duration_ms;
			totalTests++;
			yield `${BRIGHT_GREEN}✔  ${file} [${totalTests} tests]${RESET} ${CYAN}${_.round(totalDuration, 2)} ms${RESET}\n`;
		} else if (event.type == "test:fail" && event.data.details.type != "suite") {
			const data = event.data;
			const file = getFilePath(data.file);
			if (lastFile == file && !failed) {
				yield `${ERASE_LAST_LINE}`;
			}
			lastFile = file;
			failed = true;
			const error = util.format(data.details.error.cause);
			const path = `${file}:${data.line}`;
			yield `${BRIGHT_RED}✖  ${path} [${data.name}]${RESET} ${CYAN}${RESET}\n${error}\n`;
		} else if (event.type == "test:diagnostic") {
			lastFile = "";
			if (isFirstDiagnostic) {
				isFirstDiagnostic = false;
				yield `---------------------\n`;
			}
			const msg = event.data.message;
			if (msg.endsWith(" 0")) {
				continue;
			}
			if (msg.startsWith("pass ")) {
				yield `${BRIGHT_GREEN}✔  ${msg}${RESET}\n`;
			} else if (msg.startsWith("fail ")) {
				yield `${BRIGHT_RED}✖  ${msg}${RESET}\n`;
			} else if (msg.startsWith("duration_ms ")) {
				const duration = +msg.replace("duration_ms ", "");
				yield `${CYAN}${_.round(duration, 2)} ms${RESET}\n`;
			}
		} else if (event.type == "test:stderr" || event.type == "test:stdout") {
			lastFile = "";
			const msg = event.data.message;
			if (!msg.endsWith(EXPERIMENTAL_WARNING) && msg != WARNING_HINT) {
				yield `${msg}\n`;
			}
		}
	}
}