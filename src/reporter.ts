import {TestEvent} from "node:test/reporters";
import path from "path";
import util from "util";

export default async function*(source: TestEvent[]) {
	// https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
	const MODIFY = `\x1b[`;
	const BRIGHT_RED = `${MODIFY}91m`;
	const BRIGHT_GREEN = `${MODIFY}92m`;
	const RESET = `${MODIFY}0m`;
	const EXPERIMENTAL_WARNING = (
		"ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time\n"
	);
	const WARNING_HINT = (
		"(Use `node --trace-warnings ...` to show where the warning was created)\n"
	);
	const getFilePath = (file?: string) => (file ? path.relative(path.dirname(import.meta.url), file) : "");
	const files: string[] = [];
	let isFirstDiagnostic = true;

	for await (const event of source) {
		if (event.type == "test:pass") {
			const file = getFilePath(event.data.file);
			if (!files.includes(file)) {
				files.push(file);
				yield `${BRIGHT_GREEN}✔  ${file}${RESET}\n`;
			}
		} else if (event.type == "test:fail") {
			const data = event.data;
			const file = getFilePath(data.file);
			const error = util.format(data.details.error.cause);
			yield `${BRIGHT_RED}✖  ${data.name} [${file}:${data.line}]${RESET}\n${error}\n`;
		} else if (event.type == "test:diagnostic") {
			if (isFirstDiagnostic) {
				isFirstDiagnostic = false;
				yield `---------------------\n`;
			}
			const msg = event.data.message;
			if (!msg.endsWith(" 0") && !msg.startsWith("suites ")) {
				yield `${msg}\n`;
			}
		} else if (event.type == "test:stderr" || event.type == "test:stdout") {
			const msg = event.data.message;
			if (!msg.endsWith(EXPERIMENTAL_WARNING) && msg != WARNING_HINT) {
				yield `${msg}\n`;
			}
		}
	}
}