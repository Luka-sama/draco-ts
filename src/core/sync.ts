import {AnyEntity, ChangeSet, ChangeSetType, EventSubscriber, FlushEventArgs, Subscriber} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity";
import Location from "../map/location.entity";
import Zone from "../map/zone";
import ZoneEntities from "../map/zone-entities";
import {Vec2, Vector2} from "../math/vector.embeddable";
import {EM} from "./orm";
import {toSync} from "./sync.decorator";
import {AreaType, Sync, SyncFor, SyncForCustom, SyncMap, SyncModel, SyncProperty, SyncType} from "./sync.typings";
import WS from "./ws";
import {Emitter, UserData} from "./ws.typings";

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

	/** Initializes an infinite loop with {@link synchronize} */
	static init(): void {
		setInterval(Synchronizer.synchronize, 10);
	}

	/** Calculates sync map for given change sets */
	static async addChangeSets(changeSets: ChangeSet<AnyEntity>[]): Promise<void> {
		for (const changeSet of changeSets) {
			const syncMap = await Synchronizer.getSyncMap(changeSet);
			Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);
		}
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
		for (const [emitter, syncList] of Synchronizer.syncMap) {
			Synchronizer.emitSync(emitter, syncList);
		}
		Synchronizer.syncMap.clear();
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
		const subzones = zone.getSubzones();
		const syncMap: SyncMap = new Map();
		subzones.forEach(subzone => syncMap.set(subzone, syncList));
		Synchronizer.mergeSyncMaps(Synchronizer.syncMap, syncMap);

		if (toCreate) {
			zone.enter(entity);
		} else {
			zone.leave(entity);
		}
	}

	/** Emits the given sync list to the given emitter(s) */
	private static emitSync(emitters: Emitter | Set<Emitter>, syncList: Sync[]): void {
		if (syncList.length > 0) {
			for (const emitter of (emitters instanceof Set ? emitters : [emitters])) {
				emitter.emit("sync", {syncList});
			}
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
				syncList.push({model, type: "create", entity: convertedEntity});
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
			syncList.push({model, type: "delete", entity: {id: entity.id}});
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
	private static async getSyncMap(changeSet: ChangeSet<AnyEntity>): Promise<SyncMap> {
		const syncMap: SyncMap = new Map();
		const model = changeSet.name;
		const entity = changeSet.entity;
		const type = Synchronizer.getSyncType(changeSet);
		const toSyncModel = toSync[model];
		const syncedProperties = Synchronizer.getSyncedProperties(toSyncModel, changeSet, type);
		if (!syncedProperties.length) {
			return syncMap;
		}

		const collectedData: Map<Emitter | AreaType, UserData> = new Map();
		for (const property of syncedProperties) {
			for (const toSyncProperty of toSyncModel[property]) {
				const emitter = await Synchronizer.getEmitter(toSyncProperty, entity);
				if (emitter instanceof Zone && !collectedData.has(emitter)) {
					const syncMapToAdd = await Synchronizer.handleZones(toSyncProperty.for, changeSet, emitter, type);
					Synchronizer.mergeSyncMaps(syncMap, syncMapToAdd);
				}

				const data = collectedData.get(emitter) || {id: entity.id};
				if (type != "delete") {
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

			const sync: Sync = {model: _.snakeCase(model), type, entity: WS.prepare(convertedEntity)};
			if (emitter instanceof Zone) {
				const subzones = emitter.getSubzones();
				for (const subzone of subzones) {
					const syncList = syncMap.get(subzone) || [];
					syncList.push(sync);
					syncMap.set(subzone, syncList);
				}
			} else {
				const syncList = syncMap.get(emitter) || [];
				syncList.push(sync);
				syncMap.set(emitter, syncList);
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
			return "create";
		} else if (changeSet.type == ChangeSetType.UPDATE) {
			return "update";
		} else if (changeSet.type == ChangeSetType.DELETE || changeSet.type == ChangeSetType.DELETE_EARLY) {
			return "delete";
		}
		throw new Error(`Unknown ChangeSetType ${changeSet.type}.`);
	}

	/**
	 * Returns a list with names of those properties that should be synced.
	 * For the creation and the deletion it returns all properties that are in the given sync model.
	 * For the updation it returns a list with names of those changed properties that are in sync model.
	 * */
	private static getSyncedProperties(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>, type: SyncType): string[] {
		if (!toSyncModel) {
			return [];
		}
		const syncProperties = Object.keys(toSyncModel);
		if (type != "update") {
			return syncProperties;
		}
		const metadata = EM.getMetadata().get(changeSet.name).properties;
		const changedProperties = Object.keys(changeSet.payload)
			// Gets original property if this is embeddable property (e.g. replaces x with position)
			.map(property => _.get(metadata[property], "embedded[0]", property))
			// Filters properties that should not be synced
			.filter(property => syncProperties.includes(property));
		return _.uniq(changedProperties);
	}

	/**
	 * Handles zones.
	 * For the creation or the deletion of an entity it updates the zone entities and returns an empty sync map.
	 * For the updation of an entity it prepares arguments for {@link changeZone}, calls it and returns its sync map
	 */
	private static async handleZones(syncFor: SyncForCustom, changeSet: ChangeSet<AnyEntity>,
		currZone: Zone, type: SyncType): Promise<SyncMap> {
		const entity = changeSet.entity;
		const model = changeSet.name;
		if (!ZoneEntities.getModels().includes(model)) {
			return new Map();
		}
		assert(syncFor == SyncFor.Zone || typeof syncFor == "object" && syncFor.location && syncFor.position);

		if (type == "create") {
			currZone.enter(entity);
		} else if (type == "delete") {
			currZone.leave(entity);
		} else if (type == "update") {
			const locationField = (syncFor == SyncFor.Zone ? "location" : syncFor.location);
			const positionField = (syncFor == SyncFor.Zone ? "position" : syncFor.position);
			const metadata = EM.getMetadata().get(model).properties;
			const [xField, yField] = Object.keys(metadata[positionField].embeddedProps);

			const original = changeSet.originalEntity;
			assert(original);
			const oldPosition = Vec2(original[xField], original[yField]);
			const oldLocation = await Location.getOrFail(original[locationField]);
			const oldZone = await Zone.getByPosition(oldLocation, oldPosition);
			return Synchronizer.changeZone(oldZone, currZone, entity, model);
		}
		return new Map();
	}

	/**
	 * Changes the zone of an entity, if the new zone is not equal to the old one.
	 * It updates the zones entities and returns a sync map for the creation/deletion of all necessary objects
	 */
	private static changeZone(oldZone: Zone, newZone: Zone, entity: AnyEntity, model: string): SyncMap {
		const syncMap: SyncMap = new Map();
		if (oldZone == newZone) {
			return syncMap;
		}
		oldZone.leave(entity);
		newZone.enter(entity);

		const newSubzones = newZone.getNewSubzones(oldZone);
		const leftSubzones = newZone.getLeftSubzones(oldZone);
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
		for (const subzone of newSubzones) {
			syncMap.set(subzone, createList);
		}
		for (const subzone of leftSubzones) {
			syncMap.set(subzone, deleteList);
		}
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
		for (const [emitter, syncListB] of B) {
			const syncListA = A.get(emitter) || [];
			syncListA.push(...syncListB);
			A.set(emitter, syncListA);
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

Synchronizer.init();