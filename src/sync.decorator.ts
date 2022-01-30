import {AnyEntity, ChangeSet, EventSubscriber, FlushEventArgs, Subscriber} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "./auth/user.entity";
import Location from "./map/location.entity";
import Zone from "./map/zone";
import {EM} from "./orm";
import {Vector2} from "./vector.embeddable";
import WS, {JSONData, UserData, WSData} from "./ws";

interface SyncProperty {
	as?: string;
	value?: any;
	map?: (value: any) => JSONData;
	onChanged?: (value: any) => void;
	hidden?: true;
}

interface SyncOptions {
	event: string;
	properties: {
		[key: string]: true | SyncProperty
	};
	zone?: true | (() => Zone);
	handler?: (changeSet: ChangeSet<AnyEntity>) => Promise<void>;
}

interface SyncData {
	[key: string]: SyncOptions[];
}

const syncData: SyncData = {};
const changeSets: ChangeSet<AnyEntity>[] = [];

export default function Sync(optionsOrList: SyncOptions | SyncOptions[]): ClassDecorator {
	const list = (optionsOrList instanceof Array ? optionsOrList : [optionsOrList]);
	return function(target: unknown): void {
		assert(typeof target == "function");
		syncData[target.name] = list;
	};
}

export async function synchronize(): Promise<void> {
	const dataToEmit: Map<User, WSData[]> = new Map();
	for (const changeSet of changeSets) {
		const list = syncData[changeSet.name];
		for (const options of list) {
			const users = await getUsers(options, changeSet.entity);
			const preparedData = prepareDataToEmit(options, changeSet);
			if (!preparedData) {
				continue;
			}
			if (options.handler) {
				await options.handler(changeSet);
			}

			for (const user of users) {
				const dataToEmitForUser = getDataToEmitForUser(options, preparedData);
				if (!dataToEmit.has(user)) {
					dataToEmit.set(user, []);
				}
				dataToEmit.get(user)!.push({event: options.event, data: dataToEmitForUser});
			}
		}
	}

	for (const [user, datasToSend] of dataToEmit) {
		for (const dataToSend of datasToSend) {
			user.emit(dataToSend.event, dataToSend.data);
		}
	}

	changeSets.length = 0;
}

async function getUsers(options: SyncOptions, entity: AnyEntity): Promise<Set<User>> {
	if (options.zone === undefined) {
		assert(entity instanceof User);
		return new Set([entity]);
	}

	if (options.zone === true) {
		assert(entity.location instanceof Location && entity.position instanceof Vector2);
		const zone = await Zone.getByUserPosition(entity.location, entity.position);
		return await zone.getConnectedUsers();
	}

	assert(typeof options.zone == "function");
	const zone = options.zone();
	return await zone.getConnectedUsers();
}

function prepareDataToEmit(options: SyncOptions, changeSet: ChangeSet<AnyEntity>): UserData | null {
	const metaProperties = EM.getMetadata().get(changeSet.name).properties;
	const properties = Object.keys(options.properties);
	// Gets original property if this is embeddable property (e. g. replaces x with position)
	const changed = Object.keys(changeSet.payload).map(property => _.get(metaProperties[property], "embedded[0]", property));
	if (changed.some(property => properties.includes(property))) {
		const data = WS.prepare(changeSet.entity, properties.filter(property => {
			const propertyOptions = options.properties[property];
			return propertyOptions === true || !propertyOptions.hidden;
		}));
		for (const property in data) {
			const propertyOptions = options.properties[property];
			if (propertyOptions === true) {
				continue;
			}
			if (propertyOptions.as) {
				data[propertyOptions.as] = data[property];
				delete data[property];
			}
		}
		return data;
	}
	return null;
}

function getDataToEmitForUser(options: SyncOptions, preparedData: UserData): UserData {
	return preparedData;
}

@Subscriber()
export class SyncSubscriber implements EventSubscriber {
	// eslint-disable-next-line require-await
	async afterFlush({uow}: FlushEventArgs): Promise<void> {
		changeSets.push(...uow.getChangeSets());
	}
}