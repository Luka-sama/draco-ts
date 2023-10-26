import Tr from "./tr.js";

describe("Tr.get", () => {
	test.each([
		// String is "test translation"
		[Tr.get("TEST_TRANSLATION"), "test translation"],

		// String is "test translation with placeholder {placeholder}"
		[Tr.get("TEST_TRANSLATION_WITH_PLACEHOLDER", {placeholder: "abc"}), "test translation with placeholder abc"],

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
	])(`"%s" should be "%s"`, (translation: string, result: string) => {
		expect(translation).toBe(result);
	});
});