const reflection = require("@mikro-orm/reflection");

/** @type {import('@mikro-orm/core/utils/Configuration').Options} */
module.exports = {
	metadataProvider: reflection.TsMorphMetadataProvider,
	forceEntityConstructor: true,
	entities: ["./dist/**/*.entity.js", "./dist/**/*.embeddable.js"],
	entitiesTs: ["./src/**/*.entity.ts", "./src/**/*.embeddable.ts"],
	type: "postgresql",
	cache: {
		options: {cacheDir: "mikroorm-cache"}
	}
};