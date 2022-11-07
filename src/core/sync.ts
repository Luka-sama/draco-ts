import {AnyEntity, ChangeSet, EventSubscriber, FlushEventArgs, Subscriber} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity";
import Location from "../map/location.entity";
import Zone from "../map/zone";
import ZoneEntities from "../map/zone-entities";
import {Vec2, Vector2} from "../math/vector.embeddable";
import {EM} from "./orm";
import {SyncFor, SyncForCustom, SyncInfo, SyncModel, SyncProperty, SyncType} from "./sync.typings";
import {Emitter, UserData} from "./ws.typings";

/** Synchronizer class. See @Sync() decorator for details */
export default class Synchronizer {
	private static toSync: {
		[key: string]: SyncModel;
	} = {};
	private static changeSets: ChangeSet<AnyEntity>[] = [];

	static addToSyncData(model: string, propertyKey: string, options: SyncProperty): void {
		if (!Synchronizer.toSync[model]) {
			Synchronizer.toSync[model] = {};
		}
		Synchronizer.toSync[model][propertyKey] = options;
	}

	static addChangeSets(changeSets: ChangeSet<AnyEntity>[]): void {
		Synchronizer.changeSets.push(...changeSets);
	}

	static async firstLoad(user: User): Promise<void> {
		const zone = await Zone.getByUser(user);
		const entities = zone.getEntities();
		const userInfo = Synchronizer.getCreateList("User", user, SyncFor.This);
		const syncInfoList = Synchronizer.getCreateLists(entities).concat(userInfo);
		Synchronizer.emitSync(user, syncInfoList);
	}

	static async synchronize(): Promise<void> {
		const dataToEmit: Map<Emitter, SyncInfo[]> = new Map();
		const changeSets = Synchronizer.changeSets;
		Synchronizer.changeSets = [];
		for (const changeSet of changeSets) {
			await Synchronizer.getChanges(changeSet, dataToEmit);
		}

		dataToEmit.forEach((syncInfoList, emitter) => Synchronizer.emitSync(emitter, syncInfoList));
	}

	static getCreateList(model: string, entities: Set<AnyEntity> | AnyEntity, syncFor: SyncForCustom): SyncInfo[] {
		const toSyncModel = Synchronizer.toSync[model];
		if (!toSyncModel) {
			return [];
		}
		model = _.snakeCase(model);

		const syncInfoList: SyncInfo[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			const convertedEntity: UserData = {};
			let hasProperties = false;
			for (const property in toSyncModel) {
				if (property == "id" || _.isEqual(toSyncModel[property].for || SyncFor.This, syncFor)) {
					hasProperties ||= (property != "id");
					Synchronizer.writePropertyToData(toSyncModel, entity, convertedEntity, property);
				}
			}
			if (hasProperties) {
				syncInfoList.push({model, type: "create", entity: convertedEntity});
			}
		}
		return syncInfoList;
	}

	static getDeleteList(model: string, entities: Set<AnyEntity> | AnyEntity): SyncInfo[] {
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

	static getCreateLists(entities: ZoneEntities): SyncInfo[] {
		return entities
			.getModels()
			.map(model => Synchronizer.getCreateList(model, entities.get(model), SyncFor.Zone))
			.flat();
	}

	static getDeleteLists(entities: ZoneEntities): SyncInfo[] {
		return entities
			.getModels()
			.map(model => Synchronizer.getDeleteList(model, entities.get(model)))
			.flat();
	}

	static emitSync(emitters: Emitter | Set<Emitter>, syncInfoList: SyncInfo[]): void {
		if (syncInfoList.length > 0) {
			for (const emitter of (emitters instanceof Set ? emitters : [emitters])) {
				emitter.emit("sync", {syncInfoList});
			}
		}
	}

	private static async getChanges(changeSet: ChangeSet<AnyEntity>, dataToEmit: Map<Emitter, SyncInfo[]>): Promise<void> {
		const model = changeSet.name;

		const toSyncModel = Synchronizer.toSync[model];
		if (!toSyncModel) {
			return;
		}

		const entity = changeSet.entity;
		assert(typeof entity.id == "number");

		let type: SyncType;
		if (changeSet.type == "create" || changeSet.type == "update" || changeSet.type == "delete") {
			type = changeSet.type;
		} else {
			return;
		}

		let syncedProperties: string[] = [];
		if (type == "update") {
			syncedProperties = Synchronizer.getChangedProperties(toSyncModel, changeSet);
		} else if (type == "create" || type == "delete") {
			syncedProperties = Object.keys(toSyncModel);
		}
		if (!syncedProperties.length) {
			return;
		}

		const collectedData = await Synchronizer.collectData(toSyncModel, changeSet, syncedProperties, entity, type);
		for (const [emitter, entity] of collectedData) {
			const syncInfoList = dataToEmit.get(emitter) || [];
			const syncInfo: SyncInfo = {model: _.snakeCase(model), type, entity};
			syncInfoList.push(syncInfo);
			dataToEmit.set(emitter, syncInfoList);
		}
	}

	/** Returns list with names of those changed properties that are in sync model */
	private static getChangedProperties(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>): string[] {
		const syncProperties = Object.keys(toSyncModel);
		const metadata = EM.getMetadata().get(changeSet.name).properties;
		const changedProperties = Object.keys(changeSet.payload)
			// Gets original property if this is embeddable property (e.g. replaces x with position)
			.map(property => _.get(metadata[property], "embedded[0]", property))
			// Filters properties that should not be synced
			.filter(property => syncProperties.includes(property));
		return _.uniq(changedProperties);
	}

	private static async collectData(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>, syncedProperties: string[],
		entity: AnyEntity, type: SyncType): Promise<Map<Emitter, UserData>> {
		const collectedData: Map<Emitter, UserData> = new Map();

		for (const property of syncedProperties) {
			const emitter = await Synchronizer.getEmitter(toSyncModel[property], entity);
			if (!emitter) {
				continue;
			}
			if (emitter instanceof Zone && !collectedData.has(emitter)) {
				await Synchronizer.handleZones(toSyncModel, changeSet, emitter, type, property);
			}

			const data = collectedData.get(emitter) || {id: entity.id};
			if (type != "delete") {
				Synchronizer.writePropertyToData(toSyncModel, entity, data, property);
			}
			collectedData.set(emitter, data);
		}

		return collectedData;
	}

	private static async handleZones(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>,
		currZone: Zone, type: SyncType, property: string): Promise<void> {
		const entity = changeSet.entity, model = changeSet.name;
		const zoneModels = currZone.getModels();
		if (!zoneModels.includes(model)) {
			return;
		}
		const syncFor = toSyncModel[property].for || SyncFor.This;
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
			Synchronizer.changeZone(oldZone, currZone, entity, model);
		}
	}

	private static changeZone(oldZone: Zone, newZone: Zone, entity: AnyEntity, model: string): void {
		if (oldZone == newZone) {
			return;
		}
		oldZone.leave(entity);
		newZone.enter(entity);

		const newSubzones = newZone.getNewSubzones(oldZone);
		const leftSubzones = newZone.getLeftSubzones(oldZone);
		const newEntities = Zone.getEntitiesFromSubzones(newSubzones);
		const leftEntities = Zone.getEntitiesFromSubzones(leftSubzones);

		if (entity instanceof User) {
			Synchronizer.emitSync(user, Synchronizer.getCreateLists(newEntities));
			Synchronizer.emitSync(user, Synchronizer.getDeleteLists(leftEntities));
		}
		Synchronizer.emitSync(newSubzones, Synchronizer.getCreateList(model, entity, SyncFor.Zone));
		Synchronizer.emitSync(leftSubzones, Synchronizer.getDeleteList(model, entity));
	}

	private static async getEmitter(toSyncProperty: SyncProperty, entity: AnyEntity): Promise<Emitter | null> {
		const syncFor = toSyncProperty.for || SyncFor.This;
		if (syncFor == SyncFor.This) {
			assert(typeof entity.emit == "function" && typeof entity.info == "function");
			return entity as Emitter;
		} else if (syncFor == SyncFor.Zone) {
			assert(entity.location instanceof Location && entity.position instanceof Vector2);
			return await Zone.getByPosition(entity.location, entity.position);
		} else if (typeof syncFor == "string") {
			return await User.get(entity[syncFor]);
		} else if (syncFor.location && syncFor.position) {
			const location = entity[syncFor.location];
			const position = entity[syncFor.position];
			assert(location instanceof Location && position instanceof Vector2);
			return await Zone.getByPosition(location, position);
		}
		return null;
	}

	/** Writes a property to an entity object that will be sent to the user */
	private static writePropertyToData(toSyncModel: SyncModel, entity: AnyEntity, data: UserData, property: string): void {
		const syncProperty = toSyncModel[property];
		let value = entity[property];
		if (syncProperty.map) {
			value = syncProperty.map(value);
		}
		data[syncProperty.as || property] = value;
	}
}

@Subscriber()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SyncSubscriber implements EventSubscriber {
	// eslint-disable-next-line class-methods-use-this, require-await
	async afterFlush({uow}: FlushEventArgs): Promise<void> {
		Synchronizer.addChangeSets(uow.getChangeSets());
	}
}