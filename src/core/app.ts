import glob from "glob";
import * as path from "path";
import Cache from "../cache/cache";
import ORM from "./orm";
import WS from "./ws";

/** App class */
export default class App {
	private static started = false;

	/** Initializes all components (Cache, ORM, WS etc) */
	static async init(): Promise<void> {
		if (App.started) {
			return;
		}
		App.started = true;

		App.autoimport();
		App.catchExceptions();
		await ORM.init();
		await WS.init();
		Cache.init();
	}

	/** Auto-import to make @OnlyLogged() and other decorators to work without explicit import */
	private static autoimport(): void {
		const ignore = [
			"./**/*.entity.js", "./**/*.test.js", "./**/*.typings.js",
			"./seeder.js", "./jest-setup.js",
		];
		const files = glob.sync("./**/*.js", {ignore, cwd: "./dist", root: __dirname});
		for (const file of files) {
			import(path.join("..", file));
		}
	}

	/** Catches uncaught exceptions and unhandled rejections */
	private static catchExceptions(): void {
		process.on("uncaughtException", error => {
			console.error(`Uncaught exception [${new Date()}]:\r\n${error.stack}`);
		});

		process.on("unhandledRejection", (error: Error) => {
			console.error(`Unhandled rejection [${new Date()}]:\r\n${error?.stack ? error.stack : error}`);
		});
	}
}