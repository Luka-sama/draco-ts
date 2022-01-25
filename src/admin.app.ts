// @ts-ignore
import AdminJSHapi from "@adminjs/hapi";
import {Database, Resource} from "@adminjs/mikroorm";
// @ts-ignore
import Hapi from "@hapi/hapi";
import AdminJS from "adminjs";
import {validate} from "class-validator";
import ORM from "./orm";

export default class AdminApp {
	static async init() {
		await ORM.init();
		Resource.validate = validate;
		AdminJS.registerAdapter({ Database, Resource });
		const server = Hapi.server({port: 3000, host: "localhost"})
		const adminOptions = {
			databases: [ORM.getInstance()],
		};
		await server.register({
			plugin: AdminJSHapi,
			options: adminOptions,
		});
		await server.start();
		console.log(`Admin listening at ${server.info.uri}`);
	}
}