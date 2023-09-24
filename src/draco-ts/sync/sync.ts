import assert from "assert/strict";
import fs from "fs";
import _ from "lodash";
import User from "../../auth/user.entity.js";
import LightsGroup from "../../magic/lights-group.entity.js";
import Location from "../../map/location.entity.js";
import Subzone from "../../map/subzone.js";
import ZoneEntities from "../../map/zone-entities.js";
import Zone from "../../map/zone.js";
import Collection from "../orm/collection.js";
import Entity from "../orm/entity.js";
import ORM from "../orm/orm.js";
import {ChangeSet, ChangeType, EntityClass, EntityData} from "../orm/orm.typings.js";
import MapUtil from "../util/map-util.js";
import SetUtil from "../util/set-util.js";
import {JSONDataExtended, UserData} from "../util/validation.js";
import {Vec2, Vector2} from "../util/vector.js";
import WS, {Receiver} from "../ws.js";
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
	UserContainer
} from "./sync.typings.js";

/**
 * Synchronizer class. See {@link Sync} decorator for details how to use it.
 *
 * Synchronizer accepts change sets from MikroORM (alternatively, methods can be called for changes that should not affect the database).
 * For these changes the sync map is calculated (see {@link SyncMap}).
 * Every few milliseconds all accumulated syncs are emitted and the sync map is cleared.
 */
export default class Synchronizer {
	/** Sync all updates with clients every .. ms. It makes no sense to set this value lower than GAME_LOOP_FREQUENCY_MS */
	public static readonly FREQUENCY = 16;
	/** The accumulated changes to sync */
	private static syncMap: SyncMap = new Map;
	private static created: number[] = [];
	private static newZoneQueue: any[] = [];

	/** Emits all accumulated changes */
	static synchronize(): void {
		const changeSets = ORM.sync();
		Synchronizer.addChangeSets(changeSets);
		for (const [user, syncList] of Synchronizer.syncMap) {
			Synchronizer.emitSync(user, syncList);
		}
		Synchronizer.syncMap.clear();
	}

	/** Emits to the player who has just logged into the game all the necessary information */
	static firstSync(user: User, zone: Zone): void {
		const entities = zone.getEntities();
		Synchronizer.created = Array.from(entities.get(LightsGroup)).map(lightsGroup => lightsGroup.id);
		const userInfo = Synchronizer.getCreateList(User, user, SyncFor.This);
		const syncList = Synchronizer.getCreateListFromZoneEntities(entities).concat(userInfo);
		Synchronizer.emitSync(user, syncList);
		user.hadFirstSync = true; // TODO: currently log out does not update this to false; make it as a WeakSet of sockets instead
	}

	/** Syncs the creation of an entity in the zone. This is useful if the entity should not be created in the database */
	static createEntityInZone(entity: Entity): void {
		Synchronizer.createOrDeleteEntity(entity, true);
	}

	/** Syncs the deletion of an entity from the zone. This is useful if the entity should not be deleted from the database */
	static deleteEntityFromZone(entity: Entity): void {
		Synchronizer.createOrDeleteEntity(entity, false);
	}

	/** Calculates a sync map for the given change sets */
	private static addChangeSets(changeSets: ChangeSet[]): void {
		for (const changeSet of changeSets) {
			const entity = changeSet.entity;
			fs.appendFileSync("D:/test.txt", `[${Date.now()}] Syncing ${entity.constructor.name} ${entity.id} (type=${changeSet.type})\n`);
			const syncMap = Synchronizer.getSyncMapFromChangeSet(changeSet);
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}
		for (const [entity] of Entity.syncTracked) {
			const model = entity.constructor as typeof Entity;
			const syncMap = Synchronizer.getSyncMap(model, entity, ChangeType.Update, {});
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}
		//Zone.checkup();
	}

	/**
	 * Syncs the creation or the deletion of an entity.
	 * It is internally used by {@link createEntityInZone} and {@link deleteEntityFromZone}
	 */
	private static createOrDeleteEntity(entity: Entity, toCreate: boolean): void {
		const model = entity.constructor as typeof Entity;
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
	private static getCreateList<T extends Entity>(model: EntityClass, entities: Set<T> | T, syncFor: SyncForCustom): Sync[] {
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
				syncList.push([ChangeType.Create, modelName, convertedEntity]);
			}
		}
		return syncList;
	}

	/** Returns a sync list for the deletion of a given entity (entities) of the given model */
	private static getDeleteList<T extends Entity>(model: EntityClass, entities: Set<T> | T): Sync[] {
		const toSyncModel = toSync.get(model);
		if (!toSyncModel) {
			return [];
		}
		const modelName = _.snakeCase(model.name);

		const syncList: Sync[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			syncList.push([ChangeType.Delete, modelName, {id: entity.id}]);
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
	private static getSyncMapFromChangeSet(changeSet: ChangeSet): SyncMap {
		const model = changeSet.entity.constructor as typeof Entity;
		return Synchronizer.getSyncMap(model, changeSet.entity, changeSet.type, changeSet.payload, changeSet.original);
	}

	/** Calculates a sync map from the given data */
	private static getSyncMap(model: EntityClass, entity: Entity, type: ChangeType,
		payload: EntityData, original?: EntityData): SyncMap {
		const syncMap: SyncMap = new Map;
		const toSyncModel = toSync.get(model)!;
		const propertiesToSync = Synchronizer.getPropertiesToSync(model, entity, type, payload);
		if (!propertiesToSync.length) {
			return syncMap;
		}

		const collectedData = new Map<SyncForKey, UserData>;
		for (const property of propertiesToSync) {
			for (const toSyncProperty of toSyncModel.get(property)!) {
				const syncFor = toSyncProperty.for;
				const syncForKey = (typeof syncFor == "object" ? `${syncFor.location}/${syncFor.position}` : syncFor);
				const data = MapUtil.get(collectedData, syncForKey, {id: entity.id});
				if (type != ChangeType.Delete) {
					Synchronizer.writePropertyToData(toSyncProperty, entity, data, property);
				}
			}
		}

		for (const [syncForKey, convertedEntity] of collectedData) {
			const syncFor = (typeof syncForKey == "string" && syncForKey.includes("/") ? {
				location: syncForKey.split("/")[0],
				position: syncForKey.split("/")[1]
			} : syncForKey);

			const lazyCheck = type != ChangeType.Update || Object.keys(convertedEntity)
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

		if (entity.isRemoved() && type != ChangeType.Delete) {
			return new Map; // Leave sync for zone handling, but do not send events to users
		}
		return syncMap;
	}

	/**
	 * Converts an entity (with the given sync model) to a user data object that can be sent to the user (see {@link UserData}).
	 * Only those properties will be used whose syncFor is equal to the given syncFor
	 */
	private static convertEntityToUserData(toSyncModel: SyncModel, entity: Entity, syncFor: SyncForCustom): UserData {
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

	/**
	 * Returns a list with names of those properties that should be synced.
	 * For the creation and the deletion it returns all properties that are in the given sync model.
	 * For the updation it returns a list with names of those changed properties that are in sync model.
	 * */
	private static getPropertiesToSync(model: EntityClass, entity: Entity, type: ChangeType, payload: EntityData): string[] {
		const toSyncModel = toSync.get(model);
		if (!toSyncModel) {
			return [];
		}
		const syncProperties = Array.from(toSyncModel.keys());
		if (type != ChangeType.Update) {
			return syncProperties;
		}
		const trackedProperties = Array.from(Entity.syncTracked.get(entity) || []);
		Entity.syncTracked.delete(entity);
		const changedProperties = Object.keys(payload)
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
	private static handleZones(syncFor: SyncForCustom, model: EntityClass, entity: Entity,
		currZones: Set<Zone>, type: ChangeType, updateList: Sync[], original?: EntityData): SyncMap {
		if (!ZoneEntities.getModels().includes(model)) {
			return new Map();
		}
		assert(syncFor == SyncFor.Zone || typeof syncFor == "object" && syncFor.location && syncFor.position);

		if (type == ChangeType.Create) {
			for (const currZone of currZones) {
				currZone.enter(entity);
			}
		} else if (type == ChangeType.Delete) {
			for (const currZone of currZones) {
				currZone.leave(entity);
			}
		} else if (type == ChangeType.Update && original) {
			const locationField = _.snakeCase(syncFor == SyncFor.Zone ? "location" : syncFor.location) + "_id";
			const positionField = (syncFor == SyncFor.Zone ? "position" : syncFor.position);
			//const metadata = EM.getMetadata().get(model.name).properties;
			//const [xField, yField] = Object.keys(metadata[positionField].embeddedProps);
			const xField = "x", yField = "y";

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
	private static changeZone(oldZones: Set<Zone>, currZones: Set<Zone>, entity: Entity, model: EntityClass, updateList: Sync[]): SyncMap {
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
			Synchronizer.newZoneQueue.push({user: entity, zone: Zone.getByEntityFromMemory(entity), newSubzones, leftSubzones, remainingSubzones});
		}
		const createList = Synchronizer.getCreateList(model, entity, SyncFor.Zone);
		const deleteList = Synchronizer.getDeleteList(model, entity);
		Synchronizer.addToSyncMap(newSubzones, createList, syncMap, entity instanceof LightsGroup);
		Synchronizer.addToSyncMap(leftSubzones, deleteList, syncMap, entity instanceof LightsGroup, true);
		Synchronizer.addToSyncMap(remainingSubzones, updateList, syncMap);
		return syncMap;
	}

	/** Sends new entities to user and removed old entities when switching the zone */
	static async syncNewZones(): Promise<void> {
		const syncMap: SyncMap = new Map();
		for (const info of Synchronizer.newZoneQueue) {
			const user: User = info.user;
			const zone: Zone = info.zone;
			const newSubzones: Set<Subzone> = info.newSubzones;
			const leftSubzones: Set<Subzone> = info.leftSubzones;
			const remainingSubzones: Set<Subzone> = info.remainingSubzones;
			await zone.load();
			const newEntities = Zone.getEntitiesFromSubzones(newSubzones);
			const leftEntities = Zone.getEntitiesFromSubzones(leftSubzones);
			const newIds = Array.from(newEntities.get(LightsGroup)).map(lightsGroup => lightsGroup.id);
			const leftIds = Array.from(leftEntities.get(LightsGroup)).map(lightsGroup => lightsGroup.id);
			Synchronizer.created = Synchronizer.created.filter(id => !leftIds.includes(id));
			Synchronizer.created.push(...newIds);
			const remainingEntities = Zone.getEntitiesFromSubzones(remainingSubzones);
			// We need to do this as an entity can be in multiple subzones at the same time
			const entitiesToCreate = newEntities.difference(remainingEntities).difference(leftEntities);
			const entitiesToDelete = leftEntities.difference(remainingEntities).difference(newEntities);
			syncMap.set(user, _.concat(
				Synchronizer.getDeleteListFromZoneEntities(entitiesToDelete),
				Synchronizer.getCreateListFromZoneEntities(entitiesToCreate)
			));
		}
		Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
	}

	/** Returns receiver objects for the given entity and property */
	private static getReceiver(syncFor: SyncForCustom, entity: Entity): Set<Zone> | Receiver | AreaType | null {
		if (syncFor == SyncFor.This) {
			assert(typeof entity.emit == "function");
			return entity as unknown as Receiver;
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
	private static writePropertyToData(toSyncProperty: SyncProperty, entity: Entity, convertedEntity: UserData, property: string): void {
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
		syncList: Sync[], syncMap = Synchronizer.syncMap, lights = false, isDeleting = false): void {
		for (const receiver of (receivers instanceof Set ? receivers : [receivers])) {
			if (receiver instanceof Subzone && !receiver.isLoaded()) {
				continue;
			}

			const users = receiver.getUsersFromMemory();
			for (const user of users) {
				if (user.hadFirstSync) {
					if (lights) {
						const ids = syncList.map(sync => (sync as any)[2].id);
						if (!isDeleting && ids.some(id => Synchronizer.created.includes(id))) {
							console.log("check plz");
						}
						if (isDeleting) {
							Synchronizer.created = Synchronizer.created.filter(id => !ids.includes(id));
						} else {
							Synchronizer.created.push(...ids);
						}
					}
					const userSyncList = MapUtil.getArray(syncMap, user);
					userSyncList.push(...syncList);
				}
			}
		}
	}
}