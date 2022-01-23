const reflection = require("@mikro-orm/reflection");

/** @type {import('@mikro-orm/core/utils/Configuration').Options} */
module.exports = {
	metadataProvider: reflection.TsMorphMetadataProvider,
	forceEntityConstructor: true,
	entities: ["./dist/**/*.entity.js"],
	entitiesTs: ["./src/**/*.entity.ts"],
	type: "postgresql",
	cache: {
		options: {cacheDir: "mikroorm-cache"}
	}
};