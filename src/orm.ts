import {MikroORM} from "@mikro-orm/core";
import {EntityManager, PostgreSqlDriver} from "@mikro-orm/postgresql";
import config from "../mikro-orm.config";

export default class ORM {
	static orm: MikroORM<PostgreSqlDriver>;

	/** Initializes the ORM */
	static async init(): Promise<void> {
		if (!ORM.orm) {
			this.orm = await MikroORM.init(config);
		}
	}

	/** Returns new EntityManager */
	static fork(): EntityManager<PostgreSqlDriver> {
		return ORM.orm.em.fork();
	}
}