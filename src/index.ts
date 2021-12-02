import glob from "glob";
import * as path from "path";
import "reflect-metadata";
import WS from "./ws";

const ignore = ["./dist/entities/**", "./dist/**/*.test.js"];
const fileList = glob.sync("./dist/**/*.js", {ignore});
// Auto-import to make @OnlyLogged() and other descriptors to work without explicit import
for (const file of fileList) {
	import(path.resolve(file));
}

(async function() {
	process.on("uncaughtException", error => {
		console.error(`UNCAUGHT EXCEPTION [${Date.now()}]:\r\n${error.stack}`);
	});

	process.on("unhandledRejection", error => {
		console.error(`UNHANDLED REJECTION [${Date.now()}]:\r\n${error}`);
	});

	await WS.init();
})();