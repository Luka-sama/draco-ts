import {
	AnyEntity,
	ChangeSet,
	ChangeSetType,
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
import ZoneEntities from "../map/zone-entities.js";
import Zone from "../map/zone.js";
import Const from "../math/const.js";
import {Vec2, Vector2} from "../math/vector.embeddable.js";
import {EM} from "./orm.js";
import {toSync} from "./sync.decorator.js";
import {
	AreaType,
	Sync,
	SyncFor,
	SyncForCustom,
	SyncMap,
	SyncModel,
	SyncProperty,
	SyncType,
	UserContainer
} from "./sync.typings.js";
import WS from "./ws.js";
import {Emitter, UserData} from "./ws.typings.js";

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
	const model = entity.constructor.name;
	const syncProperties = Object.keys(toSync[model]);
	const metadata = EM.getMetadata().get(model).properties;
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
	private static syncMap: SyncMap = new Map();
	private static lastSyncTime = 0;
	private static syncTimeout: NodeJS.Timeout;
	private static syncTracked = new Map<AnyEntity, Set<string>>();

	/** Calculates a sync map for the given change sets */
	static async addChangeSets(changeSets: ChangeSet<AnyEntity>[]): Promise<void> {
		clearTimeout(Synchronizer.syncTimeout);

		for (const changeSet of changeSets) {
			const syncMap = await Synchronizer.getSyncMapFromChangeSet(changeSet);
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}
		for (const [entity] of Synchronizer.syncTracked) {
			if (wrap(entity, true).__processing) {
				// The entity is currently processed by another commit (in other EM instance).
				// As tracked properties will be handled by another commit, in this commit we can skip them.
				continue;
			}
			const model = entity.constructor.name;
			const syncMap = await Synchronizer.getSyncMap(model, entity, SyncType.Update, {});
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}

		if (Synchronizer.syncMap.size > 0) {
			const msLeft = Const.SYNC_FREQUENCY_MS - (Date.now() - Synchronizer.lastSyncTime);
			if (msLeft > 0) {
				Synchronizer.syncTimeout = setTimeout(Synchronizer.synchronize, msLeft);
			} else {
				Synchronizer.synchronize();
			}
		}
	}

	/** Adds track data if some tracked property was changed */
	static addTrackData(entity: AnyEntity, property: string): void {
		const changedProperties = Synchronizer.syncTracked.get(entity) || new Set();
		changedProperties.add(property);
		Synchronizer.syncTracked.set(entity, changedProperties);
	}

	/** Emits the player who has just logged into the game all the necessary information */
	static async firstLoad(user: User): Promise<void> {
		const zone = await Zone.getByEntity(user);
		const entities = zone.getEntities();
		const userInfo = Synchronizer.getCreateList("User", user, SyncFor.This);
		const syncList = Synchronizer.getCreateListFromZoneEntities(entities).concat(userInfo);
		Synchronizer.emitSync(user, syncList);
	}

	/** Emits all accumulated changes */
	static synchronize(): void {
		for (const [user, syncList] of Synchronizer.syncMap) {
			Synchronizer.emitSync(user, syncList);
		}
		Synchronizer.syncMap.clear();
		Synchronizer.lastSyncTime = Date.now();
	}

	/** Syncs the creation of an entity in the zone. This is useful if the entity should not be created in the database */
	static async createEntityInZone(entity: AnyEntity): Promise<void> {
		await Synchronizer.createOrDeleteEntity(entity, true);
	}

	/** Syncs the deletion of an entity from the zone. This is useful if the entity should not be deleted from the database */
	static async deleteEntityFromZone(entity: AnyEntity): Promise<void> {
		await Synchronizer.createOrDeleteEntity(entity, false);
	}

	/**
	 * Syncs the creation or the deletion of an entity.
	 * It is internally used by {@link createEntityInZone} and {@link deleteEntityFromZone}
	 */
	private static async createOrDeleteEntity(entity: AnyEntity, toCreate: boolean): Promise<void> {
		const model = entity.constructor.name;
		const syncList = (toCreate ?
			Synchronizer.getCreateList(model, entity, SyncFor.Zone) :
			Synchronizer.getDeleteList(model, entity)
		);
		const zone = await Zone.getByEntity(entity);
		Synchronizer.addToSyncMap(zone.getSubzones(), syncList);

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
	private static getCreateList(model: string, entities: Set<AnyEntity> | AnyEntity, syncFor: SyncForCustom): Sync[] {
		const toSyncModel = toSync[model];
		if (!toSyncModel) {
			return [];
		}
		model = _.snakeCase(model);

		const syncList: Sync[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			const convertedEntity = Synchronizer.convertEntityToUserData(toSyncModel, entity, syncFor);
			// If converted entity has any properties besides id
			if (Object.keys(convertedEntity).length > 1) {
				syncList.push([SyncType.Create, model, convertedEntity]);
			}
		}
		return syncList;
	}

	/** Returns a sync list for the deletion of a given entity (entities) of the given model */
	private static getDeleteList(model: string, entities: Set<AnyEntity> | AnyEntity): Sync[] {
		const toSyncModel = toSync[model];
		if (!toSyncModel) {
			return [];
		}
		model = _.snakeCase(model);

		const syncList: Sync[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			syncList.push([SyncType.Delete, model, {id: entity.id}]);
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
	private static async getSyncMapFromChangeSet(changeSet: ChangeSet<AnyEntity>): Promise<SyncMap> {
		const model = changeSet.name;
		const type = Synchronizer.getSyncType(changeSet);
		return await Synchronizer.getSyncMap(model, changeSet.entity, type, changeSet.payload, changeSet.originalEntity);
	}

	/** Calculates a sync map from the given data */
	private static async getSyncMap(model: string, entity: AnyEntity, type: SyncType,
		payload: EntityDictionary<AnyEntity>, original?: EntityData<AnyEntity>): Promise<SyncMap> {
		const syncMap: SyncMap = new Map();
		const toSyncModel = toSync[model];
		const propertiesToSync = Synchronizer.getPropertiesToSync(model, entity, type, payload);
		if (!propertiesToSync.length) {
			return syncMap;
		}

		const collectedData = new Map<Emitter | AreaType, UserData>();
		const zoneFromFields = new Map<Zone, SyncForCustom>();
		for (const property of propertiesToSync) {
			for (const toSyncProperty of toSyncModel[property]) {
				const emitter = await Synchronizer.getEmitter(toSyncProperty, entity);
				if (emitter instanceof Zone) {
					zoneFromFields.set(emitter, toSyncProperty.for);
				}

				const data = collectedData.get(emitter) || {id: entity.id};
				if (type != SyncType.Delete) {
					Synchronizer.writePropertyToData(toSyncProperty, entity, data, property);
				}
				collectedData.set(emitter, data);
			}
		}

		for (const [rawEmitter, convertedEntity] of collectedData) {
			let emitter: Emitter;
			if (typeof rawEmitter == "function") {
				const area = new rawEmitter(...entity.getAreaParams());
				await area.load();
				emitter = area;
			} else {
				emitter = rawEmitter;
			}

			const sync: Sync = [type, _.snakeCase(model), WS.prepare(convertedEntity)];
			if (emitter instanceof Zone) {
				const syncFor = zoneFromFields.get(emitter);
				assert(syncFor);
				const syncMapToAdd = await Synchronizer.handleZones(syncFor, model, entity, emitter, type, [sync], original);
				if (syncMapToAdd.size > 0) {
					Synchronizer.mergeSyncMaps(syncMap, syncMapToAdd);
				} else {
					Synchronizer.addToSyncMap(emitter.getSubzones(), [sync], syncMap);
				}
			} else if (emitter instanceof User) {
				const syncList = syncMap.get(emitter) || [];
				syncList.push(sync);
				syncMap.set(emitter, syncList);
			} else {
				Synchronizer.addToSyncMap(emitter as any as UserContainer, [sync], syncMap);
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
		for (const property in toSyncModel) {
			for (const toSyncProperty of toSyncModel[property]) {
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
	private static getPropertiesToSync(model: string, entity: AnyEntity, type: SyncType, payload: EntityDictionary<AnyEntity>): string[] {
		const toSyncModel = toSync[model];
		if (!toSyncModel) {
			return [];
		}
		const syncProperties = Object.keys(toSyncModel);
		if (type != SyncType.Update) {
			return syncProperties;
		}
		const metadata = EM.getMetadata().get(model).properties;
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
	private static async handleZones(syncFor: SyncForCustom, model: string, entity: AnyEntity,
		currZone: Zone, type: SyncType, updateList: Sync[], original?: EntityData<AnyEntity>): Promise<SyncMap> {
		if (!ZoneEntities.getModels().includes(model)) {
			return new Map();
		}
		assert(syncFor == SyncFor.Zone || typeof syncFor == "object" && syncFor.location && syncFor.position);

		if (type == SyncType.Create) {
			currZone.enter(entity);
		} else if (type == SyncType.Delete) {
			currZone.leave(entity);
		} else if (type == SyncType.Update && original) {
			const locationField = (syncFor == SyncFor.Zone ? "location" : syncFor.location);
			const positionField = (syncFor == SyncFor.Zone ? "position" : syncFor.position);
			const metadata = EM.getMetadata().get(model).properties;
			const [xField, yField] = Object.keys(metadata[positionField].embeddedProps);

			const oldPosition = Vec2(original[xField], original[yField]);
			const oldLocation = await Location.getOrFail(original[locationField]);
			const oldZone = await Zone.getByPosition(oldLocation, oldPosition);
			return Synchronizer.changeZone(oldZone, currZone, entity, model, updateList);
		}
		return new Map();
	}

	/**
	 * Changes the zone of an entity, if the new zone is not equal to the old one.
	 * It updates the zone entities and returns a sync map for the creation/deletion of all necessary objects
	 */
	private static changeZone(oldZone: Zone, newZone: Zone, entity: AnyEntity, model: string, updateList: Sync[]): SyncMap {
		const syncMap: SyncMap = new Map();
		if (oldZone == newZone) {
			return syncMap;
		}
		oldZone.leave(entity);
		newZone.enter(entity);

		const newSubzones = newZone.getNewSubzones(oldZone);
		const leftSubzones = newZone.getLeftSubzones(oldZone);
		const remainingSubzones = newZone.getRemainingSubzones(oldZone);
		const newEntities = Zone.getEntitiesFromSubzones(newSubzones);
		const leftEntities = Zone.getEntitiesFromSubzones(leftSubzones);

		if (entity instanceof User) {
			syncMap.set(entity, _.concat(
				Synchronizer.getCreateListFromZoneEntities(newEntities),
				Synchronizer.getDeleteListFromZoneEntities(leftEntities)
			));
		}
		const createList = Synchronizer.getCreateList(model, entity, SyncFor.Zone);
		const deleteList = Synchronizer.getDeleteList(model, entity);
		Synchronizer.addToSyncMap(newSubzones, createList, syncMap);
		Synchronizer.addToSyncMap(leftSubzones, deleteList, syncMap);
		Synchronizer.addToSyncMap(remainingSubzones, updateList, syncMap);
		return syncMap;
	}

	/** Returns an emitter object for the given entity and property */
	private static async getEmitter(toSyncProperty: SyncProperty, entity: AnyEntity): Promise<Emitter | AreaType> {
		const syncFor = toSyncProperty.for;
		if (syncFor == SyncFor.This) {
			assert(typeof entity.emit == "function" && typeof entity.info == "function");
			return entity as Emitter;
		} else if (syncFor == SyncFor.Zone) {
			assert(entity.location instanceof Location && entity.position instanceof Vector2);
			return await Zone.getByPosition(entity.location, entity.position);
		} else if (typeof syncFor == "string") {
			return await User.getOrFail(entity[syncFor]);
		} else if (typeof syncFor == "function") {
			return syncFor;
		} else if (syncFor.location && syncFor.position) {
			const location = entity[syncFor.location];
			const position = entity[syncFor.position];
			assert(location instanceof Location && position instanceof Vector2);
			return await Zone.getByPosition(location, position);
		}
		throw new Error(`The value of SyncFor is incorrect (${syncFor}).`);
	}

	/** Writes a property to an entity object that will be sent to the user */
	private static writePropertyToData(toSyncProperty: SyncProperty, entity: AnyEntity, convertedEntity: UserData, property: string): void {
		let value = entity[property];
		if (typeof toSyncProperty.map == "function") {
			value = toSyncProperty.map(value);
		} else if (typeof toSyncProperty.map == "string") {
			value = value[toSyncProperty.map];
		}
		convertedEntity[toSyncProperty.as || property] = value;
	}

	/** Merges sync map B into sync map A */
	private static mergeSyncMaps(A: SyncMap, B: SyncMap): void {
		for (const [user, syncListB] of B) {
			const syncListA = A.get(user) || [];
			syncListA.push(...syncListB);
			A.set(user, syncListA);
		}
	}

	/** Adds sync list to sync map for the given subzone(s) or something with method getUsers */
	private static addToSyncMap(emitters: UserContainer | Set<UserContainer>,
		syncList: Sync[], syncMap = Synchronizer.syncMap): void {
		for (const emitter of (emitters instanceof Set ? emitters : [emitters])) {
			const users = emitter.getUsers();
			for (const user of users) {
				const userSyncList = syncMap.get(user) || [];
				userSyncList.push(...syncList);
				syncMap.set(user, userSyncList);
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