import assert from "assert/strict";
import fs from "fs";
import {po} from "gettext-parser";
import {globSync} from "glob";
import _ from "lodash";
import Logger from "./logger.js";

/**
 * Class for string localization.
 * It is named the same as the function in Godot, which is an abbreviation of "translation".
 */
export default class Tr {
	private static logger = new Logger(Tr);
	private static locale = process.env.LOCALE || "en_US";
	private static translations = new Map<string, Map<string, string>>;

	/** Initializes gettext */
	public static init(): void {
		assert(process.env.LOCALE_DIR, "You should specify the environment variable LOCALE_DIR.");
		const files = globSync("*.po", {cwd: process.env.LOCALE_DIR, absolute: true});
		for (const file of files) {
			const parsed = po.parse(fs.readFileSync(file));
			const language = parsed.headers.Language;
			const translations = parsed.translations[""];
			const dictionary = new Map<string, string>;
			for (const msgid in translations) {
				if (msgid) {
					dictionary.set(msgid, translations[msgid].msgstr[0]);
				}
			}
			Tr.translations.set(language, dictionary);
		}
	}

	public static stop(): void {
		Tr.translations.clear();
	}

	/** Sets locale to the given if it exists in the dictionary */
	public static setLocale(locale: string): void {
		if (!Tr.translations.has(locale)) {
			Tr.logger.error(`The locale ${locale} was not found.`);
			return;
		}
		Tr.locale = locale;
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
		const replacer = (substring: string, placeholder: string, wordForms: string): string => {
			assert(placeholders, `No placeholder data was provided for the string with msgid ${msgid}.`);

			if (wordForms) {
				const form = (lastNumber == 1 ? 0 : 1);
				return wordForms.split("/")[form];
			}
			const placeholderCamelCase = _.camelCase(placeholder);
			const value = placeholders[placeholderCamelCase];
			if (value === undefined) {
				Tr.logger.error(`No data was provided for the string with msgid ${msgid} and the placeholder ${placeholder}.`);
			} else if (typeof value == "number" || typeof value == "boolean") {
				lastNumber = +value;
			}
			_.pull(notUsedKeys, placeholderCamelCase);
			return (value === undefined ? "" : value.toString());
		};

		const translation = Tr.getTranslation(msgid);
		if (!translation) {
			return msgid;
		}
		const result = translation
			// Replace all placeholders, such as {player_count} or (has/have)
			.replace(/\{(\w+)\}|\((\w*\/\w*)\)/g, replacer)
			// Remove comments
			.replace(/\/\*(.*?)\*\//g, "");
		if (notUsedKeys.length > 0) {
			Tr.logger.warn(
				`Some data was provided for the string with msgid ${msgid} and not used (the placeholders ${notUsedKeys.join(", ")}).`
			);
		}
		return result;
	}

	/**
	 * Extracts a translation for the given msgid from the dictionary.
	 * If no translation for this msgid exists, writes error to the log and returns an empty string.
	 */
	private static getTranslation(msgid: string): string {
		const dictionary = Tr.translations.get(Tr.locale);
		if (!dictionary) {
			Tr.logger.error(`No translations for locale ${Tr.locale} found.`);
			return "";
		}
		const translation = dictionary.get(msgid);
		if (translation === undefined) {
			Tr.logger.error(`No translation for msgid ${msgid} and locale ${Tr.locale} found.`);
			return "";
		}
		return translation;
	}
}