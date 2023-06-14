import {
	AnyEntity,
	ChangeSet,
	ChangeSetType,
	Collection,
	EntityClass,
	EntityData,
	EntityDictionary,
	EventSubscriber,
	FlushEventArgs,
	Subscriber,
	wrap
} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity.js";
import Location from "../map/location.entity.js";
import Subzone from "../map/subzone.js";
import ZoneEntities from "../map/zone-entities.js";
import Zone from "../map/zone.js";
import MapUtil from "../util/map-util.js";
import SetUtil from "../util/set-util.js";
import {Vec2, Vector2} from "../util/vector.embeddable.js";
import ORM, {EM} from "./orm.js";
import {toSync} from "./sync.decorator.js";
import {
	AreaType,
	Sync,
	SyncFor,
	SyncForCustom,
	SyncForKey,
	SyncMap,
	SyncModel,
	SyncProperty,
	SyncType,
	UserContainer
} from "./sync.typings.js";
import WS from "./ws.js";
import {JSONDataExtended, Receiver, UserData} from "./ws.typings.js";

/**
 * This function adds tracking for properties that should not be stored in the database.
 * It should be called immediately after the constructor, preferably in the last line of the constructor.
 * It returns the entity itself to simplify use with the CachedEntity.
 *
 * Call `syncTrack(this);` for simple entities and `return syncTrack(this.getInstance());` for cached entities.
 *
 * A limitation is that the position and location should be always stored in the database, otherwise the zone handling will not work.
 */
export function syncTrack<T extends AnyEntity>(entity: T): T {
	const model = entity.constructor;
	const toSyncModel = toSync.get(model)!;
	const syncProperties = Array.from(toSyncModel.keys());
	const metadata = EM.getMetadata().get(model.name).properties;
	const syncedProperties = syncProperties.filter(property => !metadata[property]);
	for (const property of syncedProperties) {
		const isAlreadyTracked = !!Object.getOwnPropertyDescriptor(entity, property)?.get;
		if (!isAlreadyTracked) {
			trackProperty(entity, property);
		}
	}
	return entity;
}

// This code is separated into a separate function to avoid memory leaks (by minimizing the number of variables in the scope)
function trackProperty(entity: AnyEntity, property: string): void {
	let value = entity[property];
	Object.defineProperty(entity, property, {
		get: () => value,
		set: (newValue) => {
			if (value !== newValue) {
				Synchronizer.addTrackData(entity, property);
				value = newValue;
			}
		}
	});
}

/**
 * Synchronizer class. See {@link Sync} decorator for details how to use it.
 *
 * Synchronizer accepts change sets from MikroORM (alternatively, methods can be called for changes that should not affect the database).
 * For these changes the sync map is calculated (see {@link SyncMap}).
 * Every few milliseconds all accumulated syncs are emitted and the sync map is cleared.
 */
export default class Synchronizer {
	/** The accumulated changes to sync */
	private static syncMap: SyncMap = new Map;
	private static syncTracked = new Map<AnyEntity, Set<string>>;

	/** Calculates a sync map for the given change sets */
	static async addChangeSets(changeSets: ChangeSet<AnyEntity>[]): Promise<void> {
		if (ORM.isSeeder) {
			return;
		}

		for (const changeSet of changeSets) {
			if (changeSet.entity instanceof User) {
				await Zone.getByEntity(changeSet.entity); // Load the new zone if needed so that it can be used for further synchronization
			}
			const syncMap = Synchronizer.getSyncMapFromChangeSet(changeSet);
			//console.log(Date.now(), changeSet.payload, JSON.stringify(Array.from(syncMap.values())));
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}
		for (const [entity] of Synchronizer.syncTracked) {
			if (wrap(entity, true).__processing) {
				// The entity is currently processed by another commit (in other EM instance).
				// As tracked properties will be handled by another commit, in this commit we can skip them.
				continue;
			}
			const model = entity.constructor;
			const syncMap = Synchronizer.getSyncMap(model, entity, SyncType.Update, {});
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}
	}

	/** Adds track data if some tracked property was changed */
	static addTrackData(entity: AnyEntity, property: string): void {
		if (ORM.isSeeder) {
			return;
		}
		const changedProperties = MapUtil.getSet(Synchronizer.syncTracked, entity);
		changedProperties.add(property);
	}

	/** Emits to the player who has just logged into the game all the necessary information */
	static firstSync(user: User, zone: Zone): void {
		const entities = zone.getEntities();
		const userInfo = Synchronizer.getCreateList(User, user, SyncFor.This);
		const syncList = Synchronizer.getCreateListFromZoneEntities(entities).concat(userInfo);
		Synchronizer.emitSync(user, syncList);
		user.hadFirstSync = true;
	}

	/** Emits all accumulated changes */
	static synchronize(): void {
		for (const [user, syncList] of Synchronizer.syncMap) {
			Synchronizer.emitSync(user, syncList);
		}
		Synchronizer.syncMap.clear();
	}

	/** Syncs the creation of an entity in the zone. This is useful if the entity should not be created in the database */
	static createEntityInZone(entity: AnyEntity): void {
		Synchronizer.createOrDeleteEntity(entity, true);
	}

	/** Syncs the deletion of an entity from the zone. This is useful if the entity should not be deleted from the database */
	static deleteEntityFromZone(entity: AnyEntity): void {
		Synchronizer.createOrDeleteEntity(entity, false);
	}

	/**
	 * Syncs the creation or the deletion of an entity.
	 * It is internally used by {@link createEntityInZone} and {@link deleteEntityFromZone}
	 */
	private static createOrDeleteEntity(entity: AnyEntity, toCreate: boolean): void {
		const model = entity.constructor;
		const syncList = (toCreate ?
			Synchronizer.getCreateList(model, entity, SyncFor.Zone) :
			Synchronizer.getDeleteList(model, entity)
		);
		const zone = Zone.getByEntityFromMemory(entity);
		if (!zone) {
			return;
		}
		Synchronizer.addToSyncMap(zone.getSubzonesFromMemory(), syncList);

		if (toCreate) {
			zone.enter(entity);
		} else {
			zone.leave(entity);
		}
	}

	/** Emits the given sync list to the given user */
	private static emitSync(user: User, syncList: Sync[]): void {
		if (syncList.length > 0) {
			user.emit("sync", {syncList});
		}
	}

	/**
	 * Returns a sync list for the creation of a given entity (entities) of the given model.
	 * Only those properties will be used whose syncFor is equal to the given syncFor
	 */
	private static getCreateList<T extends AnyEntity>(model: EntityClass<T>, entities: Set<T> | T, syncFor: SyncForCustom): Sync[] {
		const toSyncModel = toSync.get(model);
		if (!toSyncModel) {
			return [];
		}
		const modelName = _.snakeCase(model.name);

		const syncList: Sync[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			const convertedEntity = Synchronizer.convertEntityToUserData(toSyncModel, entity, syncFor);
			// If converted entity has any properties besides id
			if (Object.keys(convertedEntity).length > 1) {
				syncList.push([SyncType.Create, modelName, convertedEntity]);
			}
		}
		return syncList;
	}

	/** Returns a sync list for the deletion of a given entity (entities) of the given model */
	private static getDeleteList<T extends AnyEntity>(model: EntityClass<T>, entities: Set<T> | T): Sync[] {
		const toSyncModel = toSync.get(model);
		if (!toSyncModel) {
			return [];
		}
		const modelName = _.snakeCase(model.name);

		const syncList: Sync[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			syncList.push([SyncType.Delete, modelName, {id: entity.id}]);
		}
		return syncList;
	}

	/** Returns a sync list for the creation of all given zone entities */
	private static getCreateListFromZoneEntities(entities: ZoneEntities): Sync[] {
		return ZoneEntities
			.getModels()
			.map(model => Synchronizer.getCreateList(model, entities.get(model), SyncFor.Zone))
			.flat();
	}

	/** Returns a sync list for the deletion of all given zone entities */
	private static getDeleteListFromZoneEntities(entities: ZoneEntities): Sync[] {
		return ZoneEntities
			.getModels()
			.map(model => Synchronizer.getDeleteList(model, entities.get(model)))
			.flat();
	}

	/** Calculates a sync map from the given change set */
	private static getSyncMapFromChangeSet(changeSet: ChangeSet<AnyEntity>): SyncMap {
		const model = changeSet.entity.constructor;
		const type = Synchronizer.getSyncType(changeSet);
		return Synchronizer.getSyncMap(model, changeSet.entity, type, changeSet.payload, changeSet.originalEntity);
	}

	/** Calculates a sync map from the given data */
	private static getSyncMap(model: EntityClass<any>, entity: AnyEntity, type: SyncType,
		payload: EntityDictionary<AnyEntity>, original?: EntityData<AnyEntity>): SyncMap {
		const syncMap: SyncMap = new Map();
		const toSyncModel = toSync.get(model)!;
		const propertiesToSync = Synchronizer.getPropertiesToSync(model, entity, type, payload);
		if (!propertiesToSync.length) {
			return syncMap;
		}

		const collectedData = new Map<SyncForKey, UserData>();
		for (const property of propertiesToSync) {
			for (const toSyncProperty of toSyncModel.get(property)!) {
				const syncFor = toSyncProperty.for;
				const syncForKey = (typeof syncFor == "object" ? `${syncFor.location}/${syncFor.position}` : syncFor);
				const data = MapUtil.get(collectedData, syncForKey, {id: entity.id});
				if (type != SyncType.Delete) {
					Synchronizer.writePropertyToData(toSyncProperty, entity, data, property);
				}
			}
		}

		for (const [syncForKey, convertedEntity] of collectedData) {
			const syncFor = (typeof syncForKey == "string" && syncForKey.includes("/") ? {
				location: syncForKey.split("/")[0],
				position: syncForKey.split("/")[1]
			} : syncForKey);

			const lazyCheck = Object.keys(convertedEntity)
				.map(property => toSyncModel.get(property))
				.filter(properties => properties && properties.filter(property => _.isEqual(property.for, syncFor) && !property.lazy).length)
				.length > 0;
			/*if (!lazyCheck) {
				console.log("lazyCheck failed for", convertedEntity);
			}*/

			const rawReceiver = Synchronizer.getReceiver(syncFor, entity);
			if (rawReceiver == null) {
				continue;
			}
			let receiver: Receiver | Set<Zone>;
			if (typeof rawReceiver == "function") {
				const area = new rawReceiver(...entity.getAreaParams());
				area.setSubzones();
				receiver = area;
			} else {
				receiver = rawReceiver;
			}

			const modelName = _.snakeCase(model.name);
			const sync: Sync = [type, modelName, WS.prepare(convertedEntity)];
			if (receiver instanceof Set) {
				const syncMapToAdd = Synchronizer.handleZones(syncFor, model, entity, receiver, type, [sync], original);
				if (syncMapToAdd.size > 0) {
					Synchronizer.mergeSyncMaps(syncMap, syncMapToAdd);
				} else if (lazyCheck) {
					for (const zone of receiver) {
						Synchronizer.addToSyncMap(zone.getSubzonesFromMemory(), [sync], syncMap);
					}
				}
			} else if (receiver instanceof User && lazyCheck) {
				MapUtil.getArray(syncMap, receiver).push(sync);
			} else if (lazyCheck) {
				Synchronizer.addToSyncMap(receiver as any as UserContainer, [sync], syncMap);
			}
		}

		return syncMap;
	}

	/**
	 * Converts an entity (with the given sync model) to a user data object that can be sent to the user (see {@link UserData}).
	 * Only those properties will be used whose syncFor is equal to the given syncFor
	 */
	private static convertEntityToUserData(toSyncModel: SyncModel, entity: AnyEntity, syncFor: SyncForCustom): UserData {
		const convertedEntity: UserData = {id: entity.id};
		for (const [property, toSyncProperties] of toSyncModel) {
			for (const toSyncProperty of toSyncProperties) {
				if (_.isEqual(toSyncProperty.for, syncFor)) {
					Synchronizer.writePropertyToData(toSyncProperty, entity, convertedEntity, property);
				}
			}
		}
		return WS.prepare(convertedEntity);
	}

	/** Converts ChangeSetType of MikroORM to {@link SyncType} */
	private static getSyncType(changeSet: ChangeSet<AnyEntity>): SyncType {
		if (changeSet.type == ChangeSetType.CREATE) {
			return SyncType.Create;
		} else if (changeSet.type == ChangeSetType.UPDATE || changeSet.type == ChangeSetType.UPDATE_EARLY) {
			return SyncType.Update;
		} else if (changeSet.type == ChangeSetType.DELETE || changeSet.type == ChangeSetType.DELETE_EARLY) {
			return SyncType.Delete;
		}
		throw new Error(`Unknown ChangeSetType ${changeSet.type}.`);
	}

	/**
	 * Returns a list with names of those properties that should be synced.
	 * For the creation and the deletion it returns all properties that are in the given sync model.
	 * For the updation it returns a list with names of those changed properties that are in sync model.
	 * */
	private static getPropertiesToSync(model: EntityClass<any>, entity: AnyEntity, type: SyncType, payload: EntityDictionary<AnyEntity>): string[] {
		const toSyncModel = toSync.get(model);
		if (!toSyncModel) {
			return [];
		}
		const syncProperties = Array.from(toSyncModel.keys());
		if (type != SyncType.Update) {
			return syncProperties;
		}
		const metadata = EM.getMetadata().get(model.name).properties;
		const trackedProperties = Array.from(Synchronizer.syncTracked.get(entity) || []);
		Synchronizer.syncTracked.delete(entity);
		const changedProperties = Object.keys(payload)
			// Gets original property if this is embeddable property (e.g. replaces x with position)
			.map(property => _.get(metadata[property], "embedded[0]", property))
			// Filters properties that should not be synced
			.filter(property => syncProperties.includes(property))
			.concat(trackedProperties);
		return _.uniq(changedProperties);
	}

	/**
	 * Handles zones.
	 * For the creation or the deletion of an entity it updates the zone entities and returns an empty sync map.
	 * For the updation of an entity it prepares arguments for {@link changeZone}, calls it and returns its sync map
	 */
	private static handleZones(syncFor: SyncForCustom, model: EntityClass<any>, entity: AnyEntity,
		currZones: Set<Zone>, type: SyncType, updateList: Sync[], original?: EntityData<AnyEntity>): SyncMap {
		if (!ZoneEntities.getModels().includes(model)) {
			return new Map();
		}
		assert(syncFor == SyncFor.Zone || typeof syncFor == "object" && syncFor.location && syncFor.position);

		if (type == SyncType.Create) {
			for (const currZone of currZones) {
				currZone.enter(entity);
			}
		} else if (type == SyncType.Delete) {
			for (const currZone of currZones) {
				currZone.leave(entity);
			}
		} else if (type == SyncType.Update && original) {
			const locationField = (syncFor == SyncFor.Zone ? "location" : syncFor.location);
			const positionField = (syncFor == SyncFor.Zone ? "position" : syncFor.position);
			const metadata = EM.getMetadata().get(model.name).properties;
			const [xField, yField] = Object.keys(metadata[positionField].embeddedProps);

			const oldLocation = Location.getIfCached(original[locationField]);
			assert(oldLocation);
			const oldPosition = Vec2(original[xField], original[yField]);
			const oldPositions = (entity.getPositions ? entity.getPositions(oldPosition) : [oldPosition]);
			const oldZones = Zone.getByPositionsFromMemory(oldLocation, oldPositions);
			return Synchronizer.changeZone(oldZones, currZones, entity, model, updateList);
		}
		return new Map();
	}

	/**
	 * Changes the zone of an entity, if the new zone is not equal to the old one.
	 * It updates the zone entities and returns a sync map for the creation/deletion of all necessary objects
	 */
	private static changeZone(oldZones: Set<Zone>, currZones: Set<Zone>, entity: AnyEntity, model: EntityClass<any>, updateList: Sync[]): SyncMap {
		const syncMap: SyncMap = new Map();
		const leftZones = SetUtil.difference(oldZones, currZones);
		const newZones = SetUtil.difference(currZones, oldZones);
		if (leftZones.size + newZones.size == 0) {
			return syncMap;
		}
		leftZones.forEach(zone => zone.leave(entity));
		newZones.forEach(zone => zone.enter(entity));

		const newSubzones = Zone.getNewSubzones(oldZones, currZones);
		const leftSubzones = Zone.getLeftSubzones(oldZones, currZones);
		const remainingSubzones = Zone.getRemainingSubzones(oldZones, currZones);

		if (entity instanceof User) {
			const newEntities = Zone.getEntitiesFromSubzones(newSubzones);
			const leftEntities = Zone.getEntitiesFromSubzones(leftSubzones);
			const remainingEntities = Zone.getEntitiesFromSubzones(remainingSubzones);
			// We need to do this as an entity can be in multiple subzones at the same time
			const entitiesToCreate = newEntities.difference(remainingEntities).difference(leftEntities);
			const entitiesToDelete = leftEntities.difference(remainingEntities).difference(newEntities);
			syncMap.set(entity, _.concat(
				Synchronizer.getDeleteListFromZoneEntities(entitiesToDelete),
				Synchronizer.getCreateListFromZoneEntities(entitiesToCreate)
			));
		}
		const createList = Synchronizer.getCreateList(model, entity, SyncFor.Zone);
		const deleteList = Synchronizer.getDeleteList(model, entity);
		Synchronizer.addToSyncMap(newSubzones, createList, syncMap);
		Synchronizer.addToSyncMap(leftSubzones, deleteList, syncMap);
		Synchronizer.addToSyncMap(remainingSubzones, updateList, syncMap);
		return syncMap;
	}

	/** Returns receiver objects for the given entity and property */
	private static getReceiver(syncFor: SyncForCustom, entity: AnyEntity): Set<Zone> | Receiver | AreaType | null {
		if (syncFor == SyncFor.This) {
			assert(typeof entity.emit == "function" && typeof entity.info == "function");
			return entity as Receiver;
		} else if (syncFor == SyncFor.Zone) {
			assert(entity.location instanceof Location && entity.position instanceof Vector2);
			const positions = (entity.getPositions ? entity.getPositions() : [entity.position]);
			return Zone.getByPositionsFromMemory(entity.location, positions);
		} else if (typeof syncFor == "string") {
			return User.getIfCached(entity[syncFor]);
		} else if (typeof syncFor == "function") {
			return syncFor;
		} else if (syncFor.location && syncFor.position) {
			const location = entity[syncFor.location];
			const position = entity[syncFor.position];
			assert(location instanceof Location && position instanceof Vector2);
			const positions = (entity.getPositions ? entity.getPositions(position) : [position]);
			return Zone.getByPositionsFromMemory(location, positions);
		}
		throw new Error(`The value of SyncFor is incorrect (${syncFor}).`);
	}

	/** Writes a property to an entity object that will be sent to the user */
	private static writePropertyToData(toSyncProperty: SyncProperty, entity: AnyEntity, convertedEntity: UserData, property: string): void {
		let value = entity[property];
		if (value === undefined || value === null) {
			if ("default" in toSyncProperty) {
				value = toSyncProperty.default;
			} else {
				return;
			}
		} else if (value instanceof Collection) {
			assert(value.isInitialized());
			value = value.getItems().map((el: any) => Synchronizer.mapProperty(toSyncProperty, el));
			throw new Error("Collection synchronization is not implemented.");
		} else {
			value = Synchronizer.mapProperty(toSyncProperty, value);
		}
		convertedEntity[toSyncProperty.as || property] = value;
	}

	/** Maps the property (i.e. prepares it for sending to client) using option `map` */
	private static mapProperty(toSyncProperty: SyncProperty, value: any): JSONDataExtended {
		if (typeof toSyncProperty.map == "function") {
			return toSyncProperty.map(value);
		} else if (typeof toSyncProperty.map == "string") {
			return _.get(value, toSyncProperty.map);
		} else if (toSyncProperty.map instanceof Array) {
			return _.pick(value, toSyncProperty.map);
		}
		return value;
	}

	/** Merges sync map B into sync map A */
	private static mergeSyncMaps(A: SyncMap, B: SyncMap): void {
		for (const [user, syncListB] of B) {
			MapUtil.getArray(A, user).push(...syncListB);
		}
	}

	/** Adds sync list to sync map for the given subzone(s) or something with method getUsers */
	private static addToSyncMap(receivers: UserContainer | Set<UserContainer>,
		syncList: Sync[], syncMap = Synchronizer.syncMap): void {
		for (const receiver of (receivers instanceof Set ? receivers : [receivers])) {
			if (receiver instanceof Subzone && !receiver.isLoaded()) {
				continue;
			}

			const users = receiver.getUsersFromMemory();
			for (const user of users) {
				if (user.hadFirstSync) {
					const userSyncList = MapUtil.getArray(syncMap, user);
					userSyncList.push(...syncList);
				}
			}
		}
	}
}

@Subscriber()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SyncSubscriber implements EventSubscriber {
	// eslint-disable-next-line class-methods-use-this
	async afterFlush({uow}: FlushEventArgs): Promise<void> {
		await Synchronizer.addChangeSets(uow.getChangeSets());
	}
}