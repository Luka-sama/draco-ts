import assert from "assert/strict";
import fs from "fs";
import {po} from "gettext-parser";
import {globSync} from "glob";
import _ from "lodash";
import Gettext from "node-gettext";
import Logger from "./logger.js";

/**
 * Class for string localization.
 * It is named the same as the function in Godot, which is an abbreviation of "translation". */
export default class Tr {
	private static LOCALE_DIR = "./locales";
	private static logger = new Logger(Tr);
	private static gt = new Gettext();

	/** Initializes gettext */
	public static init(): void {
		const files = globSync("*.po", {cwd: Tr.LOCALE_DIR, absolute: true});
		for (const file of files) {
			const parsed = po.parse(fs.readFileSync(file));
			Tr.gt.addTranslations(parsed.headers.Language, "messages", parsed);
		}

		Tr.gt.setLocale(process.env.LOCALE || "en_US");
		Tr.gt.on("error", Tr.logger.error);
	}

	/** Returns translated string.
	 * The first parameter should always be a static string (not a variable or expression), as it is then parsed by pybabel.
	 *
	 * It supports placeholders and plural forms.
	 * For example, the string can look so:
	 * `{some_count} (singular/plural)`, e.g. `{player_count} player(/s)`.
	 * Then you can use this in the code so:
	 * `Tr.get("SOME_STRING_WITH_DATA", {playerCount: 123})`.
	 * (It automatically converts placeholder names to camel case.)
	 *
	 * For plural forms, the number from last numeric placeholder is used.
	 * If you wish to use a number without displaying it in the string, you can use comments: `/*{player_count}*\/player(/s)`.
	 *
	 * The boolean placeholders are also treated as numbers, e.g. `/*{is_female}*\/(He/She)`.
	 */
	public static get(msgid: string, placeholders?: {[key: string]: number | boolean | string}): string {
		const notUsedKeys = Object.keys(placeholders || {});
		let lastNumber = 0;
		const replacer = (substring: string, placeholder: string, wordForms: string) => {
			assert(placeholders, `No placeholder data was provided for the string with msgid ${msgid}.`);

			if (wordForms) {
				const form = (lastNumber == 1 ? 0 : 1);
				return wordForms.split("/")[form];
			}
			const placeholderCamelCase = _.camelCase(placeholder);
			const value = placeholders[placeholderCamelCase];
			assert(value !== undefined, `No data was provided for the string with msgid ${msgid} and the placeholder ${placeholder}.`);
			if (typeof value == "number" || typeof value == "boolean") {
				lastNumber = +value;
			}
			_.pull(notUsedKeys, placeholderCamelCase);
			return value.toString();
		};

		const translation = Tr.gt.gettext(msgid);
		if (msgid == translation) {
			return msgid;
		}
		const result = translation
			// Replace all placeholders, such as {player_count} or (has/have)
			.replace(/\{(\w+)\}|\((\w*\/\w*)\)/g, replacer)
			// Remove comments
			.replace(/\/\*(.*?)\*\//g, "");
		console.assert(
			notUsedKeys.length < 1,
			`Some data was provided for the string with msgid ${msgid} and not used (the placeholders ${notUsedKeys.join(", ")}).`
		);
		return result;
	}
}