import {faker} from "@faker-js/faker";
import assert from "assert/strict";
import Account from "./auth/account.entity";
import User from "./auth/user.entity";
import ORM, {EM} from "./core/orm";
import Location from "./map/location.entity";
import {Vec2} from "./math/vector.embeddable";

export default class Seeder {
	static started = false;

	static async run(): Promise<void> {
		if (Seeder.started) {
			return;
		}
		Seeder.started = true;

		console.log("Seeder started...");
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
		const accounts = Seeder.createAccounts(10);
		const locations = Seeder.createLocations(10);
		Seeder.createUsers(10, accounts, locations);
	}

	static createAccounts(count: number): Account[] {
		const accounts: Account[] = [];
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
		const locations: Location[] = [];

		for (let i = 0; i < count; i++) {
			locations.push( EM.create(Location, {
				name: ["world"][i] || faker.datatype.string()
			}) );
		}

		return locations;
	}

	static createUsers(count: number, accounts: Account[], locations: Location[]): User[] {
		const users: User[] = [];
		for (let i = 0; i < count; i++) {
			const account = accounts[i < 2 ? 0 : Math.min(i, accounts.length - 1)];
			users.push( EM.create(User, {
				name: ["Luka", "Test"][i] || faker.helpers.unique(faker.name.firstName),
				account,
				regDate: faker.date.soon(10, account.regDate.toString()),
				location: locations[0],
				position: Vec2(faker.datatype.number({min: 0, max: 30}), faker.datatype.number({min: 0, max: 30})),
				connected: false,
			}) );
		}

		return users;
	}
}

Seeder.run();