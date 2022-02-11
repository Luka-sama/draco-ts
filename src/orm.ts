import {MikroORM, Options} from "@mikro-orm/core";
import {EntityManager, PostgreSqlDriver} from "@mikro-orm/postgresql";
import config from "../mikro-orm.config";

/**
 * EntityManager instance
 *
 * As we use RequestContext helper, it will automatically pick the request specific context under the hood.
 * @category ORM
 */
let EM: EntityManager;

/**
 * Simple ORM wrapper
 *
 * @category ORM
 */
export default class ORM {
	private static orm: MikroORM<PostgreSqlDriver>;

	/** Initializes the ORM */
	static async init(replacedOptions: Options<PostgreSqlDriver> = {}): Promise<void> {
		if (!ORM.orm) {
			ORM.orm = await MikroORM.init({...config, ...replacedOptions});
			EM = ORM.orm.em;
		}
	}

	/** Returns the ORM instance */
	static getInstance(): MikroORM<PostgreSqlDriver> {
		return ORM.orm;
	}
}

export {EM};