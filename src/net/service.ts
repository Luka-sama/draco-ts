import assert from "assert/strict";
import {AsyncLocalStorage} from "node:async_hooks";
import Logger from "../core/logger.js";
import BaseProtoClass from "./base-proto-class.js";
import Session from "./session.js";

/** Service options to customize its behavior */
export interface ServiceOptions {
	/**
	 * By default, it is not guaranteed that the services are executed in the order as the client sent it.
	 * Set this flag to `true` to guarantee this
	 * (at the cost of performance, as the server may have to wait for missing packets),
	 * if the wrong order can cause bugs (e.g. for the services that start and end moves;
	 * it would be a problem if the server would first execute end moving and then start).
	 * The order will be guaranteed across all services with this flag set to `true`.
	 */
	correctOrder?: boolean;
	/**
	 * Rate limiting. If specified, the invocation of the service will be delayed if `limit` ms
	 * have not yet elapsed since the last completion. If a service is delayed and the user sent one more request,
	 * the delayed service will be replaced with the new one (so the old one will be ignored).
	 * This way, it is guaranteed that this service will not run more often than once per `limit` ms.
	 *
	 * See also {@link Service.getSpeed} and {@link Service.errorOnLimit}.
	 */
	limit?: number;
	/**
	 * By default, rate limiting only applies when some entities have been changed.
	 * Set it to `true` to apply rate limiting always.
	 */
	limitAlways?: boolean;
	/**
	 * If set to `true`, this service will be allowed to run before the previous instance
	 * of the same service finishes running.
	 */
	allowSimultaneously?: boolean;
}

/**
 * Service class.
 * You can override all optional public methods to prepare, validate and process user input in some way.
 * You don't need to call `super.prepare();` (unless you have your own base service class and need to call its method).
 * For readability purposes, such methods get the current service instance
 * to make possible the destructuring assignment.
 *
 * Only for messages and message types it makes sense to make fields optional (as in the example below).
 * Other field types always have some value (e.g. numbers are 0 by default, they are never undefined).
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
	protected session!: Session;
	/** With this AsyncLocalStorage it is always possible to know which service is running this code */
	private static asyncLocalStorage = new AsyncLocalStorage();
	/** Saves whether some entities were modified with this service */
	private hasModifiedEntities = false;

	/**
	 * Executes a service. Includes all steps (rate limiting, preparing, validating, running etc.).
	 * This method is executed twice for UDP with `correctOrder` set first to `false` and then to `true`
	 * (one time the service is ignored). If the client has sent a message via web sockets,
	 * this method will be called only once (with `correctOrder` undefined).
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
		const limit = (speed ? 1000 / speed : options.limit);
		if (limit && this.errorOnLimit && this.session.getShouldWait(ServiceClass, limit) > 0) {
			await this.errorOnLimit(this);
			return;
		} else if (limit && !this.errorOnLimit) {
			await session.softLimit(ServiceClass, limit);
		}

		if (!options.allowSimultaneously && !session.lockService(ServiceClass)) {
			return;
		}
		try {
			await Service.asyncLocalStorage.run(this, async () => {
				await this.prepare?.(this);
				if (this.validate && !(await this.validate(this))) {
					Service.logger.warn(`User input for ${ServiceClass.name} failed validation.`);
				} else {
					await this.run!(this);
				}
			});
		} catch(e) {
			Service.logger.error(e);
		} finally {
			session.unlockService(ServiceClass);
		}

		if (limit && (this.hasModifiedEntities || options.limitAlways)) {
			session.updateLastTime(ServiceClass);
		}
	}

	/**
	 * Tracks a change made to an entity to remember that rate limiting should be applied.
	 * See also {@link ServiceOptions.limitAlways}
	 */
	public static trackChange(): void {
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
	 * You should validate in this method only the wrong input that can't be sent by users using official client
	 * (without third-party software for cheating) as it will be silently rejected (with a warning in logs).
	 * If this is some input that is wrong but can be entered by the user, you should check it in {@link Service.run}
	 * and send an error to the user.
	 */
	public validate?(service: this): boolean | Promise<boolean>;

	/** Runs the service (i.e. produces some reaction to the user message) */
	public run?(service: this): void | Promise<void>;

	/**
	 * Rate limiting, similar to {@link ServiceOptions.limit}. It has two differences:
	 * - You should specify the speed, not the frequency (the frequency will then be calculated as 1000 / speed).
	 * - Since this is a method, the speed can be calculated dynamically (e.g. depending on the service parameters).
	 * You should specify either {@link ServiceOptions.limit} or this method, not both.
	 */
	public getSpeed?(service: this): number | Promise<number>;

	/**
	 * If specified, the request sent too early will be rejected (instead of being delaying)
	 * and this method will be called
	 */
	public errorOnLimit?(service: this): void | Promise<void>;
}