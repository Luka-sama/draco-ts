import ORM from "./orm.js";
import {IEntity, ORMHelper} from "./orm.typings.js";

export default class Entity {
	public id!: number;
	public __helper: ORMHelper = {initialized: false, populated: false};
	[key: string]: any;

	public static create<T extends IEntity>(this: T, params: {[key: string]: any}): InstanceType<T> {
		const entity = new this as InstanceType<T>;
		for (const param in params) {
			(entity as any)[param] = params[param];
		}
		ORM.insert(entity);
		return entity;
	}

	public static async get<T extends IEntity>(this: T, where: number | string): Promise<InstanceType<T> | null> {
		return await ORM.findOne(this, where) as any;
	}

	public static async getOrFail<T extends IEntity>(this: T, where: number | string): Promise<InstanceType<T>> {
		return await ORM.findOneOrFail(this, where) as any;
	}

	public static getIfCached<T extends IEntity>(this: T, id: number): InstanceType<T> | null {
		return ORM.getIfCached(this, id) as any;
	}

	constructor() {
		//syncTrack(this);
		return new Proxy(this, {set: Entity.rememberChange});
	}

	public isInitialized() {
		return this.__helper.initialized;
	}

	public isPopulated() {
		return this.__helper.populated;
	}

	public remove(): void {
		ORM.remove(this);
	}

	private static rememberChange(target: Entity, property: string | symbol, value: any): boolean {
		(target as any)[property] = value;
		//ORM.update(this as any);
		return true;
	}
}