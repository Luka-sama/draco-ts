import faker from "@faker-js/faker";
import {RequestContext} from "@mikro-orm/core";
import assert from "assert/strict";
import Account from "./auth/account.entity";
import User from "./auth/user.entity";
import Location from "./map/location.entity";
import {Vec2} from "./math/vector.embeddable";
import ORM, {EM} from "./core/orm";

export default class Seeder {
	static started = false;

	static async run(): Promise<void> {
		if (Seeder.started) {
			return;
		}
		Seeder.started = true;

		console.log("Seeder started...");
		await ORM.init({persistOnCreate: true});
		assert(process.env.NODE_ENV == "development", "You should start seeder only in development environment.");
		await ORM.getInstance().getSchemaGenerator().refreshDatabase();
		faker.seed(123);
		await RequestContext.createAsync(EM, Seeder.seed);
		await ORM.getInstance().close();
		console.log("Seeder finished!");
	}

	static async seed(): Promise<void> {
		const accounts = Seeder.createAccounts(10);
		const locations = Seeder.createLocations(10);
		Seeder.createUsers(10, accounts, locations);
		await EM.flush();
	}

	static createAccounts(count: number): Account[] {
		const accounts: Account[] = [];
		const dates = faker.date.betweens(faker.date.past(2).toString(), faker.date.past(1).toString(), count);
		for (let i = 0; i < count; i++) {
			const name = ["Luka-sama"][i] || faker.name.firstName();
			accounts.push( EM.create(Account, {
				name,
				mail: faker.internet.email(name),
				pass: ["123456789"][i] || faker.internet.password(),
				salt: "",
				regDate: dates[i],
				token: faker.datatype.hexaDecimal(96).substring(2).toLowerCase(),
			}) );
		}
		return accounts;
	}

	static createLocations(count: number): Location[] {
		const locations: Location[] = [];

		for (let i = 0; i < count; i++) {
			const location = EM.create(Location, {
				name: ["world"][i] || faker.datatype.string()
			});
			locations.push(location);
		}

		return locations;
	}

	static createUsers(count: number, accounts: Account[], locations: Location[]): User[] {
		const users: User[] = [];
		for (let i = 0; i < count; i++) {
			users.push( EM.create(User, {
				name: ["Luka", "Test"][i] || faker.name.firstName(),
				account: accounts[i < 2 ? 0 : i],
				regDate: faker.date.soon(10, accounts[i].regDate.toString()),
				location: locations[0],
				position: Vec2(faker.datatype.number({min: 0, max: 30}), faker.datatype.number({min: 0, max: 30})),
				connected: false,
			}) );
		}

		return users;
	}
}

Seeder.run();