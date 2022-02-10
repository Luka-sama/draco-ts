import {AnyEntity, ChangeSet, EventSubscriber, FlushEventArgs, Subscriber} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity";
import Location from "../map/location.entity";
import Zone from "../map/zone";
import {Vector2} from "../math/vector.embeddable";
import {EM} from "../orm";
import WS from "../ws";
import {UserData, WSData} from "../ws.typings";
import {SyncOptions} from "./sync.typings";

/**
 * Synchronization class. See @Sync() decorator for details
 *
 * @category Synchronization
 */
export default class Synchronization {
	private static syncData: {
		[key: string]: SyncOptions[];
	} = {};
	private static changeSets: ChangeSet<AnyEntity>[] = [];

	static addToSyncData(name: string, list: SyncOptions[]) {
		Synchronization.syncData[name] = list;
	}

	static addToChangeSets(changeSets: ChangeSet<AnyEntity>[]) {
		Synchronization.changeSets.push(...changeSets);
	}

	static async synchronize(): Promise<void> {
		const dataToEmit: Map<User, WSData[]> = new Map();
		for (const changeSet of Synchronization.changeSets) {
			const list = Synchronization.syncData[changeSet.name];
			for (const options of list) {
				const users = await Synchronization.getUsers(options, changeSet.entity);
				const preparedData = Synchronization.prepareDataToEmit(options, changeSet);
				if (!preparedData) {
					continue;
				}
				if (options.handler) {
					await options.handler(changeSet);
				}

				for (const user of users) {
					const dataToEmitForUser = Synchronization.getDataToEmitForUser(options, preparedData);
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

		Synchronization.changeSets.length = 0;
	}

	private static async getUsers(options: SyncOptions, entity: AnyEntity): Promise<Set<User>> {
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

	private static prepareDataToEmit(options: SyncOptions, changeSet: ChangeSet<AnyEntity>): UserData | null {
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

	private static getDataToEmitForUser(options: SyncOptions, preparedData: UserData): UserData {
		return preparedData;
	}
}

@Subscriber()
class SyncSubscriber implements EventSubscriber {
	// eslint-disable-next-line class-methods-use-this, require-await
	async afterFlush({uow}: FlushEventArgs): Promise<void> {
		Synchronization.addToChangeSets(uow.getChangeSets());
	}
}