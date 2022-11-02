import {AnyEntity, ChangeSet, EventSubscriber, FlushEventArgs, Subscriber} from "@mikro-orm/core";
import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity";
import Location from "../map/location.entity";
import {ZoneEntities} from "../map/subzone";
import Zone from "../map/zone";
import {Vec2, Vector2} from "../math/vector.embeddable";
import {EM} from "../orm";
import {Emitter, UserData} from "../ws.typings";
import {SyncFor, SyncForCustom, SyncInfo, SyncModel, SyncProperty, SyncType} from "./sync.typings";

/**
 * Synchronizer class. See @Sync() decorator for details
 *
 * @category Synchronization
 */
export default class Synchronizer {
	private static toSync: {
		[key: string]: SyncModel;
	} = {};
	private static changeSets: ChangeSet<AnyEntity>[] = [];

	static addToSyncData(model: string, propertyKey: string, options: SyncProperty): void {
		if (!this.toSync[model]) {
			this.toSync[model] = {};
		}
		this.toSync[model][propertyKey] = options;
	}

	static addChangeSets(changeSets: ChangeSet<AnyEntity>[]): void {
		this.changeSets.push(...changeSets);
	}

	static async firstLoad(user: User): Promise<void> {
		const zone = await Zone.getByUser(user);
		const entities = zone.getEntities();
		const syncInfoList = this.getCreateLists(entities);
		this.emitSync(user, syncInfoList);
	}

	static async synchronize(): Promise<void> {
		const dataToEmit: Map<Emitter, SyncInfo[]> = new Map();
		const changeSets = this.changeSets;
		this.changeSets = [];
		for (const changeSet of changeSets) {
			await this.getChanges(changeSet, dataToEmit);
		}

		dataToEmit.forEach((syncInfoList, emitter) => this.emitSync(emitter, syncInfoList));
	}

	static getCreateList(model: string, entities: Set<AnyEntity> | AnyEntity, syncFor: SyncForCustom): SyncInfo[] {
		const toSyncModel = this.toSync[model];
		if (!toSyncModel) {
			return [];
		}
		model = _.snakeCase(model);

		const syncInfoList: SyncInfo[] = [];
		for (const entity of (entities instanceof Set ? entities : [entities])) {
			const convertedEntity: UserData = {};
			for (const property in toSyncModel) {
				if (property == "id" || _.isEqual(toSyncModel[property].for, syncFor)) {
					this.writePropertyToData(toSyncModel, entity, convertedEntity, property);
				}
			}
			syncInfoList.push({model, type: "create", entity: convertedEntity});
		}
		return syncInfoList;
	}

	static getDeleteList(model: string, entities: Set<AnyEntity> | AnyEntity): SyncInfo[] {
		const toSyncModel = this.toSync[model];
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
		const syncInfoList: SyncInfo[] = [];
		const models = Object.keys(entities) as Array<keyof ZoneEntities>;
		for (const model of models) {
			const syncInfoListPart = this.getCreateList(model, entities[model], SyncFor.Zone);
			syncInfoList.push(...syncInfoListPart);
		}
		return syncInfoList;
	}

	static getDeleteLists(entities: ZoneEntities): SyncInfo[] {
		const syncInfoList: SyncInfo[] = [];
		const models = Object.keys(entities) as Array<keyof ZoneEntities>;
		for (const model of models) {
			const syncInfoListPart = this.getDeleteList(model, entities[model]);
			syncInfoList.push(...syncInfoListPart);
		}
		return syncInfoList;
	}

	static emitSync(emitters: Emitter | Set<Emitter>, syncInfoList: SyncInfo[]) {
		for (const emitter of (emitters instanceof Set ? emitters : [emitters])) {
			emitter.emit("sync", {syncInfoList});
		}
	}

	private static async getChanges(changeSet: ChangeSet<AnyEntity>, dataToEmit: Map<Emitter, SyncInfo[]>): Promise<void> {
		const model = changeSet.name;

		const toSyncModel = this.toSync[model];
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
			syncedProperties = this.getChangedProperties(toSyncModel, changeSet);
			if (!syncedProperties.length) {
				return;
			}
		} else if (type == "create" || type == "delete") {
			syncedProperties = Object.keys(toSyncModel);
		}

		const collectedData = await this.collectData(toSyncModel, changeSet, syncedProperties, entity, type);
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
			.filter(property => syncProperties.includes(property));
		return [...new Set(changedProperties)];
	}

	private static async collectData(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>, syncedProperties: string[],
		entity: AnyEntity, type: SyncType): Promise<Map<Emitter, UserData>> {
		const collectedData: Map<Emitter, UserData> = new Map();

		for (const property of syncedProperties) {
			const emitter = await this.getEmitter(toSyncModel[property], entity);
			if (!emitter) {
				continue;
			} else if (emitter instanceof Zone && !collectedData.has(emitter)) {
				await this.handleZones(toSyncModel, changeSet, emitter, type, property);
			}

			const data = collectedData.get(emitter) || {id: entity.id};
			if (type != "delete") {
				this.writePropertyToData(toSyncModel, entity, data, property);
			}
			collectedData.set(emitter, data);
		}

		return collectedData;
	}

	private static async handleZones(toSyncModel: SyncModel, changeSet: ChangeSet<AnyEntity>,
		currZone: Zone, type: SyncType, property: string): Promise<void> {
		const entity = changeSet.entity;
		const zoneModels = currZone.getModels();
		if (!zoneModels.includes(changeSet.name)) {
			return;
		}
		const syncFor = toSyncModel[property].for || SyncFor.This;
		assert(syncFor == SyncFor.Zone || typeof syncFor == "object" && syncFor.location && syncFor.position);

		const locationField = (syncFor == SyncFor.Zone ? "location" : syncFor.location);
		const positionField = (syncFor == SyncFor.Zone ? "position" : syncFor.position);

		if (type == "create") {
			currZone.enter(entity);
		} else if (type == "delete") {
			currZone.leave(entity);
		} else if (type == "update") {
			const metadata = EM.getMetadata().get(changeSet.name).properties;
			const [xField, yField] = Object.keys(metadata[positionField].embeddedProps);

			const original = changeSet.originalEntity;
			assert(original);
			const oldPosition = Vec2(original[xField], original[yField]);
			const oldLocation = await Location.getOrFail(original[locationField]);
			const oldZone = await Zone.getByUserPosition(oldLocation, oldPosition);
			if (oldZone != currZone) {
				oldZone.leave(entity);
				currZone.enter(entity);
				this.changeZone(oldZone, currZone, entity, changeSet.name);
			}
		}
	}

	private static changeZone(oldZone: Zone, newZone: Zone, entity: AnyEntity, model: string): void {
		const newSubzones = newZone.getNewSubzones(oldZone);
		const leftSubzones = newZone.getLeftSubzones(oldZone);
		const newEntities = Zone.getEntitiesFromSubzones(newSubzones);
		const leftEntities = Zone.getEntitiesFromSubzones(leftSubzones);

		if (entity instanceof User) {
			this.emitSync(user, this.getCreateLists(newEntities));
			this.emitSync(user, this.getDeleteLists(leftEntities));
		}
		this.emitSync(newSubzones, this.getCreateList(model, entity, SyncFor.Zone));
		this.emitSync(leftSubzones, this.getDeleteList(model, entity));
	}

	private static async getEmitter(toSyncProperty: SyncProperty, entity: AnyEntity): Promise<Emitter | null> {
		const syncFor = toSyncProperty.for || SyncFor.This;
		if (syncFor == SyncFor.This) {
			assert(typeof entity.emit == "function" && typeof entity.info == "function");
			return entity as Emitter;
		} else if (syncFor == SyncFor.Zone) {
			assert(entity.location instanceof Location && entity.position instanceof Vector2);
			return await Zone.getByUserPosition(entity.location, entity.position);
		} else if (typeof syncFor == "string") {
			return await User.get(entity[syncFor]);
		}
		const location = entity[syncFor.location];
		const position = entity[syncFor.position];
		assert(location instanceof Location && position instanceof Vector2);
		return await Zone.getByUserPosition(location, position);
	}

	private static writePropertyToData(toSyncModel: SyncModel, entity: AnyEntity, data: UserData, property: string) {
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