import _ from "lodash";
import {HttpResponse} from "uWebSockets.js";
import ORM from "../draco-ts/orm/orm.js";
import {JSONData} from "../draco-ts/util/validation.js";
import {IVector2, Vec2} from "../draco-ts/util/vector.js";
import WS from "../draco-ts/ws.js";
import Location from "./location.entity.js";
import Tile from "./tile.entity.js";
import Tileset from "./tileset.entity.js";

interface MapData {
	locName: string,
	tilesets: string[],
	map: {
		[key: number]: {
			[key: number]: {
				tileset: number,
				atlasCoords: IVector2,
				visited?: boolean
			}
		}
	}
}

export default class Deploy {
	static init(): void {
		WS.getApp().post("/deploy", (res) => {
			Deploy.readJson(res, async mapData => {
				await Deploy.deploy(mapData as any);
				res.end("Successfully deployed!");
			}, () => {
				console.log("Invalid JSON or no data at all!");
			});
		});
	}

	static async deploy(mapData: MapData): Promise<void> {
		const {locName, tilesets, map} = mapData;

		let location = await ORM.findOne(Location, {name: locName});
		if (!location) {
			location = Location.create({name: locName});
		}

		const existingTilesets = await ORM.find(Tileset, {name: tilesets});
		const tilesetMap = new Map<string, Tileset>();
		for (const tileset of existingTilesets) {
			tilesetMap.set(tileset.name, tileset);
		}
		for (const tilesetName of tilesets) {
			if (!tilesetMap.has(tilesetName)) {
				const tilesetEntity = Tileset.create({name: tilesetName});
				tilesetMap.set(tilesetName, tilesetEntity);
			}
		}

		const tiles = await ORM.find(Tile, {location}, {populate: ["tileset"]});
		for (const oldTile of tiles) {
			const newTile = _.get(map, [oldTile.position.y, oldTile.position.x]);
			if (!newTile) {
				oldTile.remove();
				continue;
			}

			const newAtlasCoords = Vec2(newTile.atlasCoords);
			const newTilesetName = tilesets[newTile.tileset];
			if (oldTile.tileset.name != newTilesetName) {
				oldTile.tileset = tilesetMap.get(newTilesetName)!;
			}
			if (!oldTile.atlasCoords.equals(newAtlasCoords)) {
				oldTile.atlasCoords = newAtlasCoords;
			}
			newTile.visited = true;
		}
		for (const y in map) {
			for (const x in map[y]) {
				const tile = map[y][x];
				if (!tile.visited) {
					const tilesetName = tilesets[tile.tileset];
					const tileset = tilesetMap.get(tilesetName)!;
					const tileEntity = new Tile(location, Vec2(+x, +y), tileset, Vec2(tile.atlasCoords));
					tileEntity.create();
				}
			}
		}

		await ORM.flush();
	}

	/** Helper function for reading a posted JSON body */
	private static readJson(res: HttpResponse, cb: (json: JSONData) => void, err: () => void): void {
		let buffer: Buffer;
		/* Register data cb */
		res.onData((ab, isLast) => {
			const chunk = Buffer.from(ab);
			if (isLast) {
				let json: string;
				if (buffer) {
					try {
						json = JSON.parse(Buffer.concat([buffer, chunk]) as any);
					} catch (e) {
						// Res.close calls onAborted
						res.close();
						return;
					}
					cb(json);
				} else {
					try {
						json = JSON.parse(chunk as any);
					} catch (e) {
						// Res.close calls onAborted
						res.close();
						return;
					}
					cb(json);
				}
			} else {
				if (buffer) {
					buffer = Buffer.concat([buffer, chunk]);
				} else {
					buffer = Buffer.concat([chunk]);
				}
			}
		});

		/* Register error cb */
		res.onAborted(err);
	}
}