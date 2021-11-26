const reflection = require("@mikro-orm/reflection");

/** @type {import('@mikro-orm/core/utils/Configuration').Options} */
module.exports = {
	metadataProvider: reflection.TsMorphMetadataProvider,
	entities: ["./dist/entities/*.js"],
	entitiesTs: ["./src/entities/*.ts"],
	type: "postgresql",
	cache: {
		options: {cacheDir: "mikroorm-cache"}
	}
};