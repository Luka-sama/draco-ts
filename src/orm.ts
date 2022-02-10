import {MikroORM} from "@mikro-orm/core";
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
	static async init(): Promise<void> {
		if (!ORM.orm) {
			ORM.orm = await MikroORM.init(config);
			EM = ORM.orm.em;
		}
	}

	/** Returns new EntityManager */
	static fork(): EntityManager<PostgreSqlDriver> {
		return ORM.orm.em.fork();
	}
}

export {EM};