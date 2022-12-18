import {TsMorphMetadataProvider} from "@mikro-orm/reflection";

/** @type {import('@mikro-orm/core/utils/Configuration').Options} */
export default {
	metadataProvider: TsMorphMetadataProvider,
	forceEntityConstructor: true,
	entities: ["./dist/**/*.entity.js", "./dist/**/*.embeddable.js"],
	entitiesTs: ["./src/**/*.entity.ts", "./src/**/*.embeddable.ts"],
	type: "postgresql",
	cache: {
		options: {cacheDir: "mikroorm-cache"}
	}
};