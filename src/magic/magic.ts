import _ from "lodash";
import User from "../auth/user.entity.js";
import ORM, {EM} from "../core/orm.js";
import Location from "../map/location.entity.js";
import Zone from "../map/zone.js";
import Const from "../util/const.js";
import {Vec2, Vector2} from "../util/vector.embeddable.js";
import Light from "./light.entity.js";
import LightsGroup from "./lights-group.entity.js";

/** Magic and lights controller */
export default class Magic {
	private static allLightsGroups: LightsGroup[] = [];

	public static async init(): Promise<void> {
		Magic.allLightsGroups = await EM.find(LightsGroup, {}, {populate: true});
	}

	public static moveAllLightsGroups(): void {
		const now = Date.now();
		ORM.register(Magic.allLightsGroups);
		for (const lightsGroup of Magic.allLightsGroups) {
			const frequency = 1000 / lightsGroup.speed;
			if (now - lightsGroup.lastMovement < frequency) {
				continue;
			}
			lightsGroup.lastMovement = now;
			Magic.moveLightsGroup(lightsGroup);
		}
	}

	public static async createLightsForMage(user: User): Promise<void> {
		for (let i = 0; i < Const.LIGHTS_GROUPS_PER_USER; i++) {
			await Magic.createLightsGroupForMage(user);
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

	public static async createLightsForAll(): Promise<void> {
		const users = await EM.find(User, {});
		for (const user of users) {
			await Magic.createLightsForMage(user);
		}
	}

	private static moveLightsGroup(lightsGroup: LightsGroup): void {
		lightsGroup.position = lightsGroup.position.add(lightsGroup.direction);
		const distanceToMage = lightsGroup.position.distanceSquaredTo(lightsGroup.targetMage.position);
		const strictMinDistance = Math.pow(Const.LIGHTS_STRICT_MIN_DISTANCE_TO_TARGET, 2);
		const softMinDistance = Math.pow(Const.LIGHTS_SOFT_MIN_DISTANCE_TO_TARGET, 2);

		if (distanceToMage <= strictMinDistance) {
			lightsGroup.toTarget = false;
		} else if (distanceToMage <= softMinDistance && _.random(0, 1)) {
			lightsGroup.toTarget = false;
		} else if (distanceToMage > softMinDistance && !lightsGroup.toTarget && !lightsGroup.markedForDeletion) {
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

	private static async createLightsGroupForMage(user: User): Promise<void> {
		const shape = Magic.generateLightsShape();
		const speed = _.random(Const.LIGHTS_MIN_SPEED, Const.LIGHTS_MAX_SPEED);
		const position = await Magic.generateLightsPosition(user);
		const direction = Magic.generateLightsDirection(position, user);

		const lightsGroup = new LightsGroup(speed, direction, user.location, position, user);
		ORM.register(lightsGroup);
		for (const part of shape) {
			const light = new Light(lightsGroup, part);
			ORM.register(light);
		}
		Magic.allLightsGroups.push(lightsGroup);
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

	private static async generateLightsPosition(user: User): Promise<Vector2> {
		const userZone = await Zone.getByEntity(user);
		const lightsZone = await Magic.getNextZoneWithoutMages(user.location, userZone);
		return lightsZone.getCentralSubzone().getRandomPositionInside();
	}

	private static async getNextZoneWithoutMages(location: Location, centerZone: Zone): Promise<Zone> {
		const centerZonePosition = centerZone.getZonePosition();
		let zoneToCheck = centerZone;
		for (let distance = 1; distance <= Const.LIGHTS_MAX_POSSIBLE_DISTANCE_FROM_TARGET; distance++) {
			for (let x = -distance; x <= distance; x++) {
				for (let y = -distance; y <= distance; y++) {
					if (Math.abs(x) === distance || Math.abs(y) === distance) {
						zoneToCheck = await Zone.get(location, centerZonePosition.add(Vec2(x, y)));
						const zoneUsers = zoneToCheck.getEntities().get(User);
						if ([...zoneUsers].filter(user => user.connected).length < 1) {
							return zoneToCheck;
						}
					}
				}
			}
		}
		return zoneToCheck;
	}
}