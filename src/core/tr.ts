import fs from "fs";
import {po} from "gettext-parser";
import glob from "glob";
import Gettext from "node-gettext";
import path from "path";

export default class Tr {
	private static gt: Gettext;

	static init(): void {
		Tr.gt = new Gettext();
		const localeDir = "./locales";
		const files = glob.sync("./*.po", {cwd: localeDir, root: __dirname});
		for (const file of files) {
			const content = fs.readFileSync(path.join(localeDir, file));
			const parsed = po.parse(content);
			const locale = file.replace("./", "").replace(".po", "");
			Tr.gt.addTranslations(locale, "messages", parsed);
		}

		Tr.gt.setLocale(process.env.LOCALE || "en_US");
		Tr.gt.on("error", Tr.onError);
	}

	static get(msgid: string): string {
		return Tr.gt.gettext(msgid);
	}

	static onError(error: Error): void {
		console.error(`No translation found for ${error}.`);
	}
}