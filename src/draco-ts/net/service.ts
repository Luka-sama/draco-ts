import assert from "assert/strict";
import Logger from "../logger.js";
import BaseProtoClass from "./base-proto-class.js";
import Session from "./session.js";
import {AsyncLocalStorage} from "node:async_hooks";

/** Service options to customize its behavior */
export interface ServiceOptions {
	correctOrder?: boolean;
	limit?: number;
	limitAlways?: boolean;
}

/**
 * Service class.
 * You can override all optional public methods to prepare, validate and process user input in some way.
 * You don't need to call `super.prepare();` if `super` here means the Service class.
 * For readability purposes, such methods get the current service instance
 * to make possible the destructuring assignment.
 *
 * Only for messages and message types it makes sense to make fields optional (see example below).
 *
 * Example of use (on the client side you should send AuthMessage to call this service):
 *
 * ```ts
 * export default class AuthService extends Service {
 *   public mail!: string;
 *   public pass!: string;
 *   public someMessageType?: SomeMessageType;
 *
 *   public validate({mail, pass}: this): boolean {
 *     return mail.length > 0 && pass.length > 0;
 *   }
 *
 *   public run({mail, pass}: this): void {
 *     // some code
 *   }
 * }
 * ```
 */
export default abstract class Service extends BaseProtoClass {
	public static readonly logger = new Logger(Service);
	/** See {@link ServiceOptions} for details */
	public static options: ServiceOptions = {};
	private static asyncLocalStorage = new AsyncLocalStorage();
	protected session!: Session;
	private hasModifiedEntities = false;

	/**
	 * Executes a service. Includes all steps (preparing, validating, running etc.).
	 * @internal
	 */
	public async _exec(session: Session, correctOrder?: boolean): Promise<void> {
		assert(this.created, `You should use the method "create" to create a service, not a constructor.`);
		this.session = session;
		const ServiceClass = (this.constructor as typeof Service);
		const options: ServiceOptions = {...Service.options, ...ServiceClass.options};
		if ((options.correctOrder && correctOrder === false) || (!options.correctOrder && correctOrder === true)) {
			return;
		}
		if (!this.run) {
			return Service.logger.error(`${ServiceClass.name} has no run method.`);
		}

		const speed = await this.getSpeed?.(this);
		const limit = (!process.env.NODE_TEST_CONTEXT ? (speed ? 1000 / speed : options.limit) : 0);
		if (limit && this.errorOnLimit && this.session.getShouldWait(ServiceClass, limit) > 0) {
            await this.errorOnLimit(this);
			return;
		} else if (limit && !this.errorOnLimit) {
			await session.softLimit(ServiceClass, limit);
		}

		if (this.prepare) {
			await this.prepare(this);
		}
		if (this.validate && !(await this.validate(this))) {
			return Service.logger.warn(`User input for ${this.constructor.name} failed validation.`);
		}
		await Service.asyncLocalStorage.run(this, async () => await this.run!(this));

		if (limit && (this.hasModifiedEntities || options.limitAlways)) {
			session.updateLastTime(ServiceClass);
		}
	}

	public static _trackChange() {
		const service = Service.asyncLocalStorage.getStore();
		if (service === undefined) {
			return;
		}
		assert(service instanceof Service);
		service.hasModifiedEntities = true;
	}

	/** Prepares data before other steps */
	public prepare?(service: this): void | Promise<void>;

	/**
	 * Validates data before processing. You don't need to validate data types
	 * (e.g. check that you got int32 and not a string), as it is handled automatically.
	 *
	 * You should validate in this method only the wrong input that can't be sent by a user using official client
	 * (without third-party software for cheating) as it will be silently rejected.
	 * If this is some input that is wrong but can be entered by the user, you should check it in {@link Service.run}
	 * and send an error to the user.
	 */
	public validate?(service: this): boolean | Promise<boolean>;

	/** Runs the service (i.e. produces some reaction to the user message) */
	public run?(service: this): void | Promise<void>;

	public getSpeed?(service: this): number | Promise<number>;

	public errorOnLimit?(service: this): void | Promise<void>;
}