import {MikroORM, Options} from "@mikro-orm/core";
import {EntityManager, PostgreSqlDriver} from "@mikro-orm/postgresql";
import config from "../../mikro-orm.config";

/**
 * EntityManager instance
 *
 * As we use RequestContext helper, it will automatically pick the request specific context under the hood.
 */
let EM: EntityManager;

/** Simple ORM wrapper */
export default class ORM {
	private static started = false;
	private static instance: MikroORM<PostgreSqlDriver>;

	/** Initializes the ORM */
	static async init(replacedOptions: Options<PostgreSqlDriver> = {}): Promise<void> {
		if (!ORM.started) {
			ORM.instance = await MikroORM.init({...config, ...replacedOptions});
			EM = ORM.instance.em;
			ORM.started = true;
		}
	}

	static async close(): Promise<void> {
		await ORM.instance.close();
	}

	/** Returns the ORM instance */
	static getInstance(): MikroORM<PostgreSqlDriver> {
		return ORM.instance;
	}

	/** Returns `true` if the ORM has already started */
	static isStarted(): boolean {
		return ORM.started;
	}
}

export {EM};