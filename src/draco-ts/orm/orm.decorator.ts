import assert from "assert/strict";
import MapUtil from "../util/map-util.js";
import {DBProperty, EntityClass, Model} from "./orm.typings.js";

export const ModelMap = new Map<EntityClass, Model>();

export function Property(options?: DBProperty): PropertyDecorator {
	return function(target: unknown, propertyKey: string | symbol): void {
		assert(target && typeof target == "object" && typeof target.constructor == "function");
		assert(typeof propertyKey == "string");
		const entityClass = target.constructor;

		MapUtil.getMap(ModelMap, entityClass).set(propertyKey, options || {});
	};
}