import {AnyEntity, MikroORM, Options} from "@mikro-orm/core";
import {EntityManager, PostgreSqlDriver} from "@mikro-orm/postgresql";
import config from "../../mikro-orm.config.cjs";
import {CachedEntity} from "../cache/cached-entity.js";

/**
 * EntityManager instance
 *
 * As we use RequestContext helper, it will automatically pick the request specific context under the hood.
 */
let EM: EntityManager;

/** Simple ORM wrapper */
export default class ORM {
	private static instance: MikroORM<PostgreSqlDriver>;

	/** Initializes the ORM */
	static async init(replacedOptions: Options<PostgreSqlDriver> = {}): Promise<void> {
		if (!ORM.instance) {
			ORM.instance = await MikroORM.init({...config, ...replacedOptions});
			EM = ORM.instance.em;
		}
	}

	/** Closes the ORM */
	static async close(): Promise<void> {
		await ORM.instance.close();
	}

	/** Returns the ORM instance */
	static getInstance(): MikroORM<PostgreSqlDriver> {
		return ORM.instance;
	}

	/**
	 * Registers the entity in the identity map if it is a loaded cached entity, otherwise persists the entity.
	 * Should always be used instead of EM.persist.
	 *
	 * See test for details (the test explains why this method is needed).
	 */
	static register(entities: AnyEntity | AnyEntity[] | Set<AnyEntity>): void {
		for (const entity of (entities instanceof Array || entities instanceof Set ? entities : [entities])) {
			if (entity instanceof CachedEntity && entity.isActive()) {
				EM.getUnitOfWork().registerManaged(entity, undefined, {loaded: true});
			} else {
				EM.persist(entity);
			}
		}
	}
}

export {EM};