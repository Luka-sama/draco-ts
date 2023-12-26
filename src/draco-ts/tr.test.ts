import assert from "assert/strict";
import fs from "fs";
import {before, mock, test} from "node:test";
import Tr from "./tr.js";

const poContent = `msgid ""
msgstr ""
"Project-Id-Version: draco-ts\\n"
"Report-Msgid-Bugs-To: EMAIL@ADDRESS\\n"
"POT-Creation-Date: 2023-10-07 00:11+0200\\n"
"PO-Revision-Date: 2023-10-07 00:28+0200\\n"
"Last-Translator: Luka-sama <luka-sama@pm.me>\\n"
"Language-Team: \\n"
"Language: en_US\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
"Generated-By: Babel 2.9.1\\n"
"X-Generator: Poedit 3.4\\n"

#: src/draco-ts/tr.test.ts:4
msgid "TEST_TRANSLATION"
msgstr "test translation"

#: src/draco-ts/tr.test.ts:6
msgid "TEST_TRANSLATION_WITH_PLACEHOLDER"
msgstr "test translation with placeholder {placeholder}"

#: src/draco-ts/tr.test.ts:8 src/draco-ts/tr.test.ts:10
#: src/draco-ts/tr.test.ts:12
msgid "TEST_TRANSLATION_WITH_PLURAL"
msgstr "test translation with {count} user(/s)"

#: src/draco-ts/tr.test.ts:14 src/draco-ts/tr.test.ts:16
msgid "TEST_TRANSLATION_WITH_COMMENTS"
msgstr "test translation with /*{count}*/user(/s)"

#: src/draco-ts/tr.test.ts:18
msgid "TEST_TRANSLATION_COMPLEX"
msgstr ""
"test complex translation with {user_and_animal_count} user(/s) and animal(/"
"s), {bot_count} bot(/s), /*{enemy_count}*/enem(y/ies)"
`;

before(() => {
	mock.method(fs, "readdirSync").mock.mockImplementation(() => [`en_US.po`]);
	mock.method(fs, "readFileSync").mock.mockImplementation(() => poContent);
	Tr.init();
	Tr.setLocale("en_US");
});

test("Tr.get", () => {
	const translations = [
		// String is "test translation"
		[Tr.get("TEST_TRANSLATION"), "test translation"],

		// String is "test translation with placeholder {placeholder}"
		[
			Tr.get("TEST_TRANSLATION_WITH_PLACEHOLDER", {placeholder: "abc"}),
			"test translation with placeholder abc"
		],

		// String is "test translation with {count} user(/s)"
		[Tr.get("TEST_TRANSLATION_WITH_PLURAL", {count: 0}), "test translation with 0 users"],
		[Tr.get("TEST_TRANSLATION_WITH_PLURAL", {count: 1}), "test translation with 1 user"],
		[Tr.get("TEST_TRANSLATION_WITH_PLURAL", {count: 123}), "test translation with 123 users"],

		// String is "test translation with /*{count}*/user(/s)"
		[Tr.get("TEST_TRANSLATION_WITH_COMMENTS", {count: 1}), "test translation with user"],
		[Tr.get("TEST_TRANSLATION_WITH_COMMENTS", {count: 123}), "test translation with users"],

		// String is "test complex translation with {user_and_animal_count} user(/s) and animal(/s),
		// {bot_count} bot(/s), /*{enemy_count}*/enem(y/ies)"
		[
			Tr.get("TEST_TRANSLATION_COMPLEX", {userAndAnimalCount: 1, botCount: 12, enemyCount: 123}),
			"test complex translation with 1 user and animal, 12 bots, enemies"
		],
	];

	for (const [actual, expected] of translations) {
		assert.equal(actual, expected);
	}
});