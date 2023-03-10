import glob from "glob";
import Cache from "../cache/cache.js";
import Deploy from "../map/deploy.js";
import ORM from "./orm.js";
import Tr from "./tr.js";
import WS from "./ws.js";

/** App class */
export default class App {
	private static started = false;

	/** Initializes all components (Cache, ORM, WS etc) */
	static async init(): Promise<void> {
		if (App.started) {
			return;
		}
		App.started = true;

		App.catchExceptions();
		Tr.init();
		Cache.init();
		await App.autoimport();
		await ORM.init();
		WS.init();
		Deploy.init();
	}

	/** Auto-import to make @OnlyLogged() and other decorators to work without explicit import */
	private static async autoimport(): Promise<void> {
		const ignore = [
			"**/*.entity.js", "**/*.test.js", "**/*.typings.js",
			"seeder.js", "jest-setup.js",
		];
		const files = await glob("./**/*.js", {ignore, cwd: "./dist"});
		for (const file of files) {
			await import(`../${file}`);
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