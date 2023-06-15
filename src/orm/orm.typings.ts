import Entity from "./entity.js";

export interface ORMHelper {
	initialized: boolean;
	populated: boolean;
}

export interface DBProperty {
	manyToOne?: EntityClass | (() => EntityClass);
	oneToMany?: [entityClass: EntityClass, foreignKey: string];
	vector?: boolean;
}

export interface IEntity {
	new(...args: any): Entity
}

export type EntityClass = typeof Entity;

export type Model = Map<string, DBProperty>;

export type Rel<T> = T;