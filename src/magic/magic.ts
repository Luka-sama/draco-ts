import assert from "assert/strict";
import _ from "lodash";
import User from "../auth/user.entity.js";
import Cache from "../cache/cache.js";
import Message from "../chat/message.entity.js";
import Location from "../map/location.entity.js";
import Zone from "../map/zone.js";
import ORM from "../orm/orm.js";
import Const from "../util/const.js";
import SetUtil from "../util/set-util.js";
import {Vec2, Vector2} from "../util/vector.js";
import Light from "./light.entity.js";
import LightsGroup from "./lights-group.entity.js";

/** Magic and lights controller */
export default class Magic {
	private static removeQueue = new Set<LightsGroup>;

	public static moveAllLightsGroups(): void {
		const zones = (Cache.getLeaves("zone") as Zone[]).filter(zone => zone.isSomebodyOnline());
		const lightsGroups = new Set<LightsGroup>;
		for (const zone of zones) {
			if (!zone.isLoaded()) {
				continue;
			}
			SetUtil.merge(lightsGroups, zone.getEntitiesFromMemory().get(LightsGroup));
			for (const user of zone.getUsersFromMemory()) {
				for (const lightsGroup of user.lightsGroups.getItems()) {
					lightsGroups.add(lightsGroup);
				}
			}
		}

		const now = Date.now();
		for (const lightsGroup of lightsGroups) {
			const frequency = 1000 / lightsGroup.speed;
			if (now - lightsGroup.lastMovement < frequency) {
				continue;
			}
			lightsGroup.lastMovement = now;
			Magic.moveLightsGroup(lightsGroup);
		}
	}

	public static async createLightsForAll(): Promise<void> {
		const users = await ORM.find(User);
		for (const user of users) {
			const zone = await Zone.getByEntity(user);
			await Magic.createLightsForMage(user, zone);
		}
	}

	public static createLightsForMage(user: User, zone: Zone): void {
		for (let i = 0; i < Const.LIGHTS_GROUPS_PER_USER; i++) {
			Magic.createLightsGroupForMage(user, zone);
		}
	}

	public static createLightsGroupForMage(targetMage: User, zone: Zone): void {
		const shape = Magic.generateLightsShape();
		const speed = _.random(Const.LIGHTS_MIN_SPEED, Const.LIGHTS_MAX_SPEED);
		const location = targetMage.location;
		const position = Magic.generateLightsPosition(targetMage, zone);
		const direction = Magic.generateLightsDirection(position, targetMage);

		const lightsGroup = LightsGroup.create({speed, direction, location, position, targetMage});
		targetMage.lightsGroups.add(lightsGroup);
		for (const position of shape) {
			const light = Light.create({lightsGroup, position});
			lightsGroup.shape.add(light);
		}
	}

	public static generateLightsDirection(from: Vector2, user: User, toTarget = true): Vector2 {
		let dir: Vector2;
		const shouldTakeRandomDirection = _.random(1, 100) <= Const.LIGHTS_RANDOM_DIRECTION_PROBABILITY;
		if (shouldTakeRandomDirection) {
			dir = Vec2(_.random(-1, 1), _.random(-1, 1));
		} else {
			dir = user.position.sub(from).sign();
			dir = (toTarget ? dir : dir.negated());
		}
		dir = (dir.equals(Vec2(0)) ? Vec2(1) : dir); // Lights should not stop
		return dir;
	}

	public static removeLightsFromQueue(): void {
		for (const lightsGroup of Magic.removeQueue) {
			for (const light of lightsGroup.shape.getItems()) {
				light.remove();
			}
			lightsGroup.targetMage.lightsGroups.remove(lightsGroup);
			lightsGroup.remove();
		}
		Magic.removeQueue.clear();
	}

	private static moveLightsGroup(lightsGroup: LightsGroup): void {
		lightsGroup.position = lightsGroup.position.add(lightsGroup.direction.toStaggered());
		const distanceToMage = lightsGroup.position.distanceSquaredTo(lightsGroup.targetMage.position);
		const strictMinDistance = Math.pow(Const.LIGHTS_STRICT_MIN_DISTANCE_TO_TARGET, 2);
		const softMinDistance = Math.pow(Const.LIGHTS_SOFT_MIN_DISTANCE_TO_TARGET, 2);
		let farAway = false;

		if (distanceToMage <= strictMinDistance) {
			lightsGroup.toTarget = false;
		} else if (distanceToMage <= softMinDistance) {
			lightsGroup.toTarget = (_.random(0, 1) ? false : lightsGroup.toTarget);
		} else if (Zone.areInDifferentZones(lightsGroup.position, lightsGroup.targetMage.position)) {
			farAway = true;
			lightsGroup.toTarget = true;
			lightsGroup.activated = false;
		}

		const shouldChangeDirection = !lightsGroup.activated && _.random(1, 100) <= Const.LIGHTS_DIRECTION_CHANGE_PROBABILITY;
		if (shouldChangeDirection) {
			lightsGroup.direction = Magic.generateLightsDirection(lightsGroup.position, lightsGroup.targetMage, lightsGroup.toTarget);
			lightsGroup.speed = _.clamp(
				lightsGroup.speed + _.random((farAway ? 0 : -Const.LIGHTS_MAX_SPEED_CHANGE), Const.LIGHTS_MAX_SPEED_CHANGE),
				Const.LIGHTS_MIN_SPEED,
				Const.LIGHTS_MAX_SPEED
			);
		}

		if (lightsGroup.activated) {
			Magic.collide(lightsGroup);
		}
	}

	private static collide(lightsGroup: LightsGroup): void {
		const users = Zone.getFromFromMemory(User, lightsGroup.location, lightsGroup.getPositions());
		if (users.size < 1) {
			return;
		}

		const zone = Zone.getByEntityFromMemory(lightsGroup.targetMage);
		assert(zone.isLoaded());
		Magic.createLightsGroupForMage(lightsGroup.targetMage, zone);
		users.forEach(user => Magic.applyMagic(lightsGroup, user));
		Magic.removeQueue.add(lightsGroup);
	}

	private static applyMagic(lightsGroup: LightsGroup, user: User): void {
		Message.create({text: `${user.id} catched`, user, location: user.location, position: user.position});
	}

	private static generateLightsShape(): Vector2[] {
		let lastPart = Vec2(0, 0);
		const shape = [lastPart];
		return shape;

		for (let i = Const.LIGHTS_MIN_COUNT_PER_GROUP - 1; i < Const.LIGHTS_MAX_COUNT_PER_GROUP - 1; i++) {
			const possibleDirections: Vector2[] = [];
			for (const y of Const.NEIGHBORING_Y) {
				for (const x of Const.NEIGHBORING_X) {
					const possibleDirection = Vec2(x, y);
					const possiblePart = lastPart.add(possibleDirection);
					if (possiblePart.x >= 0 && possiblePart.y >= 0 && (x != 0 || y != 0) && !possiblePart.isElementOf(shape)) {
						possibleDirections.push(possibleDirection);
					}
				}
			}

			if (possibleDirections.length < 1) {
				break;
			}

			const resultDirection = _.shuffle(possibleDirections)[0];
			lastPart = lastPart.add(resultDirection);
			shape.push(lastPart);
		}

		return shape;
	}

	private static generateLightsPosition(user: User, userZone: Zone): Vector2 {
		const lightsZone = Magic.getNextZoneWithoutMages(user.location, userZone);
		return lightsZone.getCentralSubzoneFromMemory().getRandomPositionInside();
	}

	private static getNextZoneWithoutMages(location: Location, centerZone: Zone): Zone {
		const centerZonePosition = centerZone.getZonePosition();
		let zoneToCheck = centerZone;
		for (let distance = 1; distance <= Const.LIGHTS_MAX_POSSIBLE_DISTANCE_FROM_TARGET; distance++) {
			for (let x = -distance; x <= distance; x++) {
				for (let y = -distance; y <= distance; y++) {
					if (Math.abs(x) === distance || Math.abs(y) === distance) {
						zoneToCheck = new Zone(location, centerZonePosition.add(Vec2(x, y)));
						if (!zoneToCheck.isSomebodyOnline()) {
							return zoneToCheck;
						}
					}
				}
			}
		}
		return zoneToCheck;
	}
}