import Entity from "./entity.js";

export interface ORMHelper {
	initialized: boolean;
	populated: boolean;
}

export interface EntityHelper extends ORMHelper {
	notCreated: boolean;
	removed: boolean;
}

export interface CollectionHelper extends ORMHelper {
	parent: Entity;
	foreignKey: string;
}

export interface DBProperty {
	manyToOne?: EntityClass | (() => EntityClass);
	oneToMany?: [entityClass: EntityClass, foreignKey: string];
	vector?: boolean;
}

export interface IEntity {
	new(...args: any): Entity
}

export interface ChangeSet {
	entity: Entity;
	type: ChangeType;
	payload: EntityData;
}
/** Type that shows whether the entity was created, updated or deleted */
export enum ChangeType {Create, Update, Delete}

export type EntityClass = typeof Entity;

export type EntityData = {[key: string]: any};

export type Model = Map<string, DBProperty>;

export type Rel<T> = T;