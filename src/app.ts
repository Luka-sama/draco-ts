import glob from "glob";
import path from "path";
import Cache from "./cache";
import ORM from "./orm";
import WS from "./ws";

export default class App {
	private static started = false;

	/** Auto-import to make @OnlyLogged() and other descriptors to work without explicit import */
	static async init() {
		if (App.started) {
			return;
		}
		App.started = true;

		App.autoimport();
		App.catchExceptions();
		Cache.init();
		await ORM.init();
		await WS.init();
	}

	private static autoimport() {
		const ignore = ["./dist/**/*.entity.js", "./dist/**/*.test.js"];
		const fileList = glob.sync("./dist/**/*.js", {ignore});
		for (const file of fileList) {
			import(path.resolve(file));
		}
	}

	private static catchExceptions() {
		process.on("uncaughtException", error => {
			console.error(`UNCAUGHT EXCEPTION [${Date.now()}]:\r\n${error.stack}`);
		});

		process.on("unhandledRejection", error => {
			console.error(`UNHANDLED REJECTION [${Date.now()}]:\r\n${error}`);
		});
	}
}