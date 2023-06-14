import _ from "lodash";
import User from "../auth/user.entity.js";
import Cache from "../cache/cache.js";
import Message from "../chat/message.entity.js";
import ORM, {EM} from "../core/orm.js";
import Location from "../map/location.entity.js";
import Zone from "../map/zone.js";
import Const from "../util/const.js";
import SetUtil from "../util/set-util.js";
import {Vec2, Vector2} from "../util/vector.embeddable.js";
import Light from "./light.entity.js";
import LightsGroup from "./lights-group.entity.js";

/** Magic and lights controller */
export default class Magic {
	public static moveAllLightsGroups(): void {
		const zones = (Cache.getLeaves("zone") as Zone[]).filter(zone => zone.isSomebodyOnline());
		const lightsGroups = new Set<LightsGroup>;
		for (const zone of zones) {
			SetUtil.merge(lightsGroups, zone.getEntitiesFromMemory().get(LightsGroup));
			for (const user of zone.getUsersFromMemory()) {
				for (const lightsGroup of user.lightsGroups) {
					lightsGroups.add(lightsGroup);
				}
			}
		}

		const now = Date.now();
		ORM.register(lightsGroups);
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
		const users = await EM.find(User, {});
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

	public static createLightsGroupForMage(user: User, zone: Zone): void {
		const shape = Magic.generateLightsShape();
		const speed = _.random(Const.LIGHTS_MIN_SPEED, Const.LIGHTS_MAX_SPEED);
		const position = Magic.generateLightsPosition(user, zone);
		const direction = Magic.generateLightsDirection(position, user);

		const lightsGroup = new LightsGroup(speed, direction, user.location, position, user);
		ORM.register(lightsGroup);
		for (const part of shape) {
			const light = new Light(lightsGroup, part);
			ORM.register(light);
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

	private static moveLightsGroup(lightsGroup: LightsGroup): void {
		lightsGroup.position = lightsGroup.position.add(lightsGroup.direction.toStaggered());
		if (lightsGroup.activated) {
			Magic.collide(lightsGroup);
			return;
		}
		const distanceToMage = lightsGroup.position.distanceSquaredTo(lightsGroup.targetMage.position);
		const strictMinDistance = Math.pow(Const.LIGHTS_STRICT_MIN_DISTANCE_TO_TARGET, 2);
		const softMinDistance = Math.pow(Const.LIGHTS_SOFT_MIN_DISTANCE_TO_TARGET, 2);

		if (distanceToMage <= strictMinDistance) {
			lightsGroup.toTarget = false;
		} else if (distanceToMage <= softMinDistance && _.random(0, 1)) {
			lightsGroup.toTarget = false;
		} else if (distanceToMage > softMinDistance && !lightsGroup.toTarget) {
			const lightsZonePosition = Zone.getZonePosition(lightsGroup.position);
			const userZonePosition = Zone.getZonePosition(lightsGroup.targetMage.position);
			const diff = lightsZonePosition.sub(userZonePosition).abs();
			if (diff.x > 1 && diff.y > 1) {
				lightsGroup.toTarget = true;
			}
		}

		const shouldChangeDirection = _.random(1, 100) <= Const.LIGHTS_DIRECTION_CHANGE_PROBABILITY;
		if (shouldChangeDirection) {
			lightsGroup.direction = Magic.generateLightsDirection(lightsGroup.position, lightsGroup.targetMage, lightsGroup.toTarget);
			lightsGroup.speed = _.clamp(
				lightsGroup.speed + _.random(-Const.LIGHTS_MAX_SPEED_CHANGE, Const.LIGHTS_MAX_SPEED_CHANGE),
				Const.LIGHTS_MIN_SPEED,
				Const.LIGHTS_MAX_SPEED
			);
		}
	}

	private static collide(lightsGroup: LightsGroup): void {
		const users = Zone.getFromFromMemory(User, lightsGroup.location, lightsGroup.getPositions());
		if (users.size < 1) {
			return;
		}
		for (const user of users) {
			Magic.applyMagic(lightsGroup, user);
			lightsGroup.activated = false;
		}
	}

	private static applyMagic(lightsGroup: LightsGroup, user: User): void {
		const message = new Message(`${user.id} catched`, user);
		ORM.register(message);
	}

	private static generateLightsShape(): Vector2[] {
		let lastPart = Vec2(0, 0);
		const shape = [lastPart];

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