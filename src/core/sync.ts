import {AnyEntity, ChangeSet, ChangeSetType, EventSubscriber, FlushEventArgs, Subscriber} from "@mikro-orm/core";
import assert from "assert/strict";
import {sync} from "glob";
import _ from "lodash";
import User from "../auth/user.entity";
import Location from "../map/location.entity";
import Zone from "../map/zone";
import ZoneEntities from "../map/zone-entities";
import {Vec2, Vector2} from "../math/vector.embeddable";
import {EM} from "./orm";
import {SyncFor, SyncForCustom, SyncInfo, SyncInfoMap, SyncModel, SyncProperty, SyncType} from "./sync.typings";
import {Emitter, UserData} from "./ws.typings";

/** Synchronizer class. See @Sync() decorator for details */
export default class Synchronizer {
	private static toSync: {
		[key: string]: SyncModel;
	} = {};
	private static syncInfoMap: SyncInfoMap = new Map();

	static init() {
		setInterval(Synchronizer.synchronize, 10);
	}

	static addToSyncProperty(model: string, propertyKey: string, options: SyncProperty[]): void {
		_.set(Synchronizer.toSync, [model, propertyKey], options);
	}

	static async addChangeSets(changeSets: ChangeSet<AnyEntity>[]): Promise<void> {
		const syncInfoMap = await Synchronizer.getSyncLists(changeSets);
		Synchronizer.mergeSyncInfoMaps(Synchronizer.syncInfoMap, syncInfoMap);
	}

	static async firstLoad(user: User): Promise<void> {
		const zone = await Zone.getByUser(user);
		const entities = zone.getEntities();
		const userInfo = Synchronizer.getCreateList("User", user, SyncFor.This);
		const syncInfoList = Synchronizer.getCreateListFromZoneEntities(entities).concat(userInfo);
		Synchronizer.emitSync(user, syncInfoList);
	}

	static synchronize(): void {
		for (const [emitter, syncInfoList] of Synchronizer.syncInfoMap) {
			Synchronizer.emitSync(emitter, syncInfoList);
		}
		Synchronizer.syncInfoMap.clear();
	}

	private static getCreateList(model: string, entities: Set<AnyEntity> | AnyEntity, syncFor: SyncForCustom): SyncInfo[] {
		const toSyncModel = Synchronizer.toSync[model];
		if (!toSyncModel) {
			return [];
		}
		model = _.snakeCase(model);

		const syncInfoList: SyncInfo[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			const convertedEntity = Synchronizer.convertEntityToUserData(toSyncModel, entity, syncFor);
			// If converted entity has any properties besides id
			if (Object.keys(convertedEntity).length > 1) {
				syncInfoList.push({model, type: "create", entity: convertedEntity});
			}
		}
		return syncInfoList;
	}

	private static getDeleteList(model: string, entities: Set<AnyEntity> | AnyEntity): SyncInfo[] {
		const toSyncModel = Synchronizer.toSync[model];
		if (!toSyncModel) {
			return [];
		}
		model = _.snakeCase(model);

		const syncInfoList: SyncInfo[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			syncInfoList.push({model, type: "delete", entity: {id: entity.id}});
		}
		return syncInfoList;
	}

	private static getCreateListFromZoneEntities(entities: ZoneEntities): SyncInfo[] {
		return ZoneEntities
			.getModels()
			.map(model => Synchronizer.getCreateList(model, entities.get(model), SyncFor.Zone))
			.flat();
	}

	private static getDeleteListFromZoneEntities(entities: ZoneEntities): SyncInfo[] {
		return ZoneEntities
			.getModels()
			.map(model => Synchronizer.getDeleteList(model, entities.get(model)))
			.flat();
	}

	private static emitSync(emitters: Emitter | Set<Emitter>, syncInfoList: SyncInfo[]): void {
		if (syncInfoList.length > 0) {
			for (const emitter of (emitters instanceof Set ? emitters : [emitters])) {
				emitter.emit("sync", {syncInfoList});
			}
		}
	}

	private static async getSyncLists(changeSets: ChangeSet<AnyEntity>[]): Promise<SyncInfoMap> {
		const syncInfoMap: SyncInfoMap = new Map();

		for (const changeSet of changeSets) {
			const model = changeSet.name;
			const toSyncModel = Synchronizer.toSync[model];
			if (!toSyncModel) {
				continue;
			}

			const entity = changeSet.entity;
			const type = Synchronizer.getSyncType(changeSet);
			const syncedProperties = Synchronizer.getSyncedProperties(toSyncModel, changeSet, type);
			if (!syncedProperties.length) {
				continue;
			}

			const syncInfoMapToAdd = await Synchronizer.collectData(toSyncModel, changeSet, syncedProperties, entity, type);
			Synchronizer.mergeSyncInfoMaps(syncInfoMap, syncInfoMapToAdd);
		}

		return syncInfoMap;
	}

	private static convertEntityToUserData(toSyncModel: SyncModel, entity: AnyEntity, syncFor: SyncForCustom): UserData {
		const convertedEntity: UserData = {id: entity.id};
		for (const property in toSyncModel) {
			for (const toSyncProperty of toSyncModel[property]) {
				if (_.isEqual(toSyncProperty.for, syncFor)) {
					Synchronizer.writePropertyToData(toSyncModel, toSyncProperty, entity, convertedEntity, property);
				}
			}
		}
		return convertedEntity;
	}

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

	/** TODO Docs Returns list with names of those changed properties that are in sync model */
	private static getSyncedProperties(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>, type: SyncType): string[] {
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

	private static async collectData(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>, syncedProperties: string[],
		entity: AnyEntity, type: SyncType): Promise<SyncInfoMap> {
		const collectedData: Map<Emitter, UserData> = new Map();
		const syncInfoMap: SyncInfoMap = new Map();
		const model = changeSet.name;

		for (const property of syncedProperties) {
			for (const toSyncProperty of toSyncModel[property]) {
				const emitter = await Synchronizer.getEmitter(toSyncProperty, entity);
				if (emitter instanceof Zone && !collectedData.has(emitter)) {
					const syncInfoMapToAdd = await Synchronizer.handleZones(toSyncProperty.for, changeSet, emitter, type);
					Synchronizer.mergeSyncInfoMaps(syncInfoMap, syncInfoMapToAdd);
				}

				const data = collectedData.get(emitter) || {id: entity.id};
				if (type != "delete") {
					Synchronizer.writePropertyToData(toSyncModel, toSyncProperty, entity, data, property);
				}
				collectedData.set(emitter, data);
			}
		}

		for (const [emitter, entity] of collectedData) {
			const syncInfo: SyncInfo = {model: _.snakeCase(model), type, entity};
			if (emitter instanceof Zone) {
				const subzones = emitter.getSubzones();
				for (const subzone of subzones) {
					const syncInfoList = syncInfoMap.get(subzone) || [];
					syncInfoList.push(syncInfo);
					syncInfoMap.set(subzone, syncInfoList);
				}
			} else {
				const syncInfoList = syncInfoMap.get(emitter) || [];
				syncInfoList.push(syncInfo);
				syncInfoMap.set(emitter, syncInfoList);
			}
		}

		return syncInfoMap;
	}

	private static async handleZones(syncFor: SyncForCustom, changeSet: ChangeSet<AnyEntity>,
		currZone: Zone, type: SyncType): Promise<SyncInfoMap> {
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

	private static changeZone(oldZone: Zone, newZone: Zone, entity: AnyEntity, model: string): SyncInfoMap {
		const syncInfoMap: SyncInfoMap = new Map();
		if (oldZone == newZone) {
			return syncInfoMap;
		}
		oldZone.leave(entity);
		newZone.enter(entity);

		const newSubzones = newZone.getNewSubzones(oldZone);
		const leftSubzones = newZone.getLeftSubzones(oldZone);
		const newEntities = Zone.getEntitiesFromSubzones(newSubzones);
		const leftEntities = Zone.getEntitiesFromSubzones(leftSubzones);

		if (entity instanceof User) {
			syncInfoMap.set(entity, _.concat(
				Synchronizer.getCreateListFromZoneEntities(newEntities),
				Synchronizer.getDeleteListFromZoneEntities(leftEntities)
			));
		}
		const createList = Synchronizer.getCreateList(model, entity, SyncFor.Zone);
		const deleteList = Synchronizer.getDeleteList(model, entity);
		for (const subzone of newSubzones) {
			syncInfoMap.set(subzone, createList);
		}
		for (const subzone of leftSubzones) {
			syncInfoMap.set(subzone, deleteList);
		}
		return syncInfoMap;
	}

	private static async getEmitter(toSyncProperty: SyncProperty, entity: AnyEntity): Promise<Emitter> {
		const syncFor = toSyncProperty.for;
		if (syncFor == SyncFor.This) {
			assert(typeof entity.emit == "function" && typeof entity.info == "function");
			return entity as Emitter;
		} else if (syncFor == SyncFor.Zone) {
			assert(entity.location instanceof Location && entity.position instanceof Vector2);
			return await Zone.getByPosition(entity.location, entity.position);
		} else if (typeof syncFor == "string") {
			return await User.getOrFail(entity[syncFor]);
		} else if (syncFor.location && syncFor.position) {
			const location = entity[syncFor.location];
			const position = entity[syncFor.position];
			assert(location instanceof Location && position instanceof Vector2);
			return await Zone.getByPosition(location, position);
		}
		throw new Error(`The value of SyncFor is incorrect (${syncFor}).`);
	}

	/** Writes a property to an entity object that will be sent to the user */
	private static writePropertyToData(toSyncModel: SyncModel, toSyncProperty: SyncProperty,
		entity: AnyEntity, data: UserData, property: string): void {
		let value = entity[property];
		if (toSyncProperty.map) {
			value = toSyncProperty.map(value);
		}
		data[toSyncProperty.as || property] = value;
	}

	private static mergeSyncInfoMaps(a: SyncInfoMap, b: SyncInfoMap) {
		for (const [emitter, syncInfoListB] of b) {
			const syncInfoListA = a.get(emitter) || [];
			syncInfoListA.push(...syncInfoListB);
			a.set(emitter, syncInfoListA);
		}
	}
}

@Subscriber()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SyncSubscriber implements EventSubscriber {
	// eslint-disable-next-line class-methods-use-this
	async afterFlush({uow}: FlushEventArgs): Promise<void> {
		Synchronizer.addChangeSets(uow.getChangeSets());
	}
}

Synchronizer.init();