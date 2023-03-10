import fs from "fs";
import {po} from "gettext-parser";
import {globSync} from "glob";
import Gettext from "node-gettext";
import path from "path";

export default class Tr {
	private static gt: Gettext;
	private static testEnvironment = false;

	static init(testEnvironment = false): void {
		if (testEnvironment) {
			Tr.testEnvironment = true;
			return;
		}
		Tr.gt = new Gettext();
		const localeDir = "./locales";
		const files = globSync("./*.po", {cwd: localeDir});
		for (const file of files) {
			const content = fs.readFileSync(path.join(localeDir, file));
			const parsed = po.parse(content);
			const locale = file.replace("./", "").replace(".po", "");
			Tr.gt.addTranslations(locale, "messages", parsed);
		}

		const env = fs.readFileSync(".env").toString();
		const locale = env.split("LOCALE=")[1]?.split("\n")[0].trim() || "en_US";
		Tr.gt.setLocale(locale);
		Tr.gt.on("error", Tr.onError);
	}

	static get(msgid: string): string {
		return Tr.testEnvironment ? msgid : Tr.gt.gettext(msgid);
	}

	static onError(error: Error): void {
		console.error(`No translation found for ${error}.`);
	}
}