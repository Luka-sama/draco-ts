import assert from "assert/strict";
import Logger from "../logger.js";
import BaseProtoClass from "./base-proto-class.js";

/** Service options to customize its behavior */
export interface ServiceOptions {

}

/**
 * Service class.
 * You can override all optional public methods to prepare, validate and process user input in some way.
 * You don't need to call `super.prepare();` if `super` here means the Service class.
 * For readability purposes, such methods get the current service instance
 * to make possible the destructuring assignment.
 *
 * Example of use (on the client side you should send AuthMessage to call this service):
 *
 * ```ts
 * export default class AuthService extends Service {
 *   public mail!: string;
 *   public pass!: string;
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

	/**
	 * Executes a service. Includes all steps (preparing, validating, running etc.).
	 * @internal
	 */
	public async _exec() {
		assert(this.created, `You should use the method "create" to create a service, not a constructor.`);
		const dynamicOptions = (this.options ? await this.options(this) : {});
		const options: ServiceOptions = {...(this.constructor as typeof Service).options, ...dynamicOptions};
		if (this.prepare) {
			await this.prepare(this);
		}
		if (this.validate && !(await this.validate(this))) {
			Service.logger.warn(`User input for ${this.constructor.name} failed validation.`);
			return;
		}
		if (this.run) {
			await this.run(this);
		}
	}

	/** Use this instead of {@link Service.options} if you need to calculate options dynamically */
	public options?(service: this): ServiceOptions | Promise<ServiceOptions>;

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
}