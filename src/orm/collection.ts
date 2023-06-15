import SetUtil from "../util/set-util.js";
import Entity from "./entity.js";
import {ORMHelper} from "./orm.typings.js";

export default class Collection<T extends Entity> {
	private set = new Set<T>;
	public __helper: ORMHelper = {initialized: false, populated: false};

	public add(entity: T) {
		this.set.add(entity);
	}

	public remove(entity: T) {
		this.set.delete(entity);
	}

	public addEntities(createFrom: T[] | Set<T>): void {
		SetUtil.merge(this.set, (createFrom instanceof Array ? new Set(createFrom) : createFrom));
	}

	public getItems(): T[] {
		return Array.from(this.set);
	}

	public isInitialized() {
		return this.__helper.initialized;
	}

	public isPopulated() {
		return this.__helper.populated;
	}
}