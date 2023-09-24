import SetUtil from "../util/set-util.js";
import Entity from "./entity.js";
import {CollectionHelper} from "./orm.typings.js";

export default class Collection<T extends Entity> {
	private set = new Set<T>;
	public __helper: CollectionHelper;

	public constructor(parent: Entity, foreignKey: string) {
		this.__helper = {initialized: false, populated: false, parent, foreignKey};
	}

	public add(entity: T) {
		this.set.add(entity);
		(entity as any)[this.__helper.foreignKey] = this.__helper.parent;
	}

	public remove(entity: T) {
		this.set.delete(entity);
		(entity as any)[this.__helper.foreignKey] = null;
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