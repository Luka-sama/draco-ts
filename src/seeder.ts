import {faker} from "@faker-js/faker";
import assert from "assert/strict";
import Account from "./auth/account.entity.js";
import User from "./auth/user.entity.js";
import ORM, {EM} from "./core/orm.js";
import ItemShapePart from "./item/item-shape-part.entity.js";
import ItemType from "./item/item-type.entity.js";
import Item from "./item/item.entity.js";
import Location from "./map/location.entity.js";
import Const from "./util/const.js";
import {Vec2} from "./util/vector.embeddable.js";

export default class Seeder {
	static started = false;

	static async run(): Promise<void> {
		if (Seeder.started) {
			return;
		}
		Seeder.started = true;

		console.log("Seeder started...");
		ORM.isSeeder = true;
		await ORM.init({allowGlobalContext: true, persistOnCreate: true});
		assert(process.env.NODE_ENV == "development", "You should start seeder only in development environment.");
		await ORM.getInstance().getSchemaGenerator().refreshDatabase();
		faker.seed(123);
		Seeder.seed();
		await EM.flush();
		await ORM.close();
		console.log("Seeder finished!");
	}

	static seed(): void {
		const locations = Seeder.createLocations(10);

		const accounts = Seeder.createAccounts(10);
		Seeder.createUsers(10, accounts, locations);

		const itemTypes = Seeder.createItemTypes(1);
		Seeder.createItemShapeParts(3, itemTypes);
		Seeder.createItems(1, itemTypes, locations);
	}

	static createAccounts(count: number): Account[] {
		const accounts = [] as Account[];
		const dates = faker.date.betweens(faker.date.past(2).toString(), faker.date.past(1).toString(), count);
		for (let i = 0; i < count; i++) {
			const name = ["Luka-sama"][i] || faker.helpers.unique(faker.name.firstName);
			accounts.push( EM.create(Account, {
				name,
				mail: faker.helpers.unique(faker.internet.email, [name]),
				pass: ["123456789"][i] || faker.internet.password(),
				salt: "",
				regDate: dates[i],
				token: faker.datatype.hexadecimal({length: 96}).substring(2).toLowerCase(),
			}) );
		}
		return accounts;
	}

	static createLocations(count: number): Location[] {
		const locations = [] as Location[];

		for (let i = 0; i < count; i++) {
			locations.push( EM.create(Location, {
				name: ["world"][i] || faker.datatype.string()
			}) );
		}

		return locations;
	}

	static createUsers(count: number, accounts: Account[], locations: Location[]): User[] {
		const users = [] as User[];
		for (let i = 0; i < count; i++) {
			const account = accounts[i < 2 ? 0 : Math.min(i, accounts.length - 1)];
			users.push( EM.create(User, {
				name: ["Luka", "Test"][i] || faker.helpers.unique(faker.name.firstName),
				account,
				regDate: faker.date.soon(10, account.regDate.toString()),
				location: locations[0],
				position: Vec2(faker.datatype.number({min: 0, max: 30}), faker.datatype.number({min: 0, max: 15}) * 2),
				speed: Const.MOVEMENT_WALK_SPEED,
				connected: false,
			}) );
		}

		return users;
	}

	static createItemTypes(count: number): ItemType[] {
		const itemTypes = [] as ItemType[];
		for (let i = 0; i < count; i++) {
			itemTypes.push( EM.create(ItemType, {
				name: "sofa",
				height: 0,
				walkable: false,
				takable: false,
				weight: 0
			}) );
		}

		return itemTypes;
	}

	static createItemShapeParts(count: number, itemTypes: ItemType[]): ItemShapePart[] {
		const itemShapeParts = [] as ItemShapePart[];
		for (let i = 0; i < count; i++) {
			itemShapeParts.push( EM.create(ItemShapePart, {
				type: itemTypes[0],
				position: Vec2(i, 0)
			}) );
		}

		return itemShapeParts;
	}

	static createItems(count: number, itemTypes: ItemType[], locations: Location[]): Item[] {
		const items = [] as Item[];
		for (let i = 0; i < count; i++) {
			items.push( EM.create(Item, {
				type: itemTypes[0],
				location: locations[0],
				position: Vec2(i + 10, 20)
			}) );
		}

		return items;
	}
}

Seeder.run();