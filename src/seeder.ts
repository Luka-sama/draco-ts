import faker from "@faker-js/faker";
import {RequestContext} from "@mikro-orm/core";
import Account from "./auth/account.entity";
import User from "./auth/user.entity";
import Location from "./map/location.entity";
import {Vec2} from "./math/vector.embeddable";
import ORM, {EM} from "./orm";

export default class Seeder {
	static started = false;

	static async run(): Promise<void> {
		if (Seeder.started) {
			return;
		}
		Seeder.started = true;

		console.log("Seeder started...");
		await ORM.init();
		await ORM.getInstance().getSchemaGenerator().refreshDatabase();
		faker.seed(123);
		await RequestContext.createAsync(EM, Seeder.seed);
		await ORM.getInstance().close();
		console.log("Seeder finished!");
	}

	static async seed(): Promise<void> {
		const accounts = Seeder.getAccounts();
		const locations = Seeder.getLocations();
		const users = Seeder.getUsers(accounts, locations);
		await EM.persistAndFlush(locations.concat(accounts).concat(users));
	}

	static getAccounts(): Account[] {
		const accounts: Account[] = [];
		for (let i = 0; i < 10; i++) {
			const name = faker.name.firstName();
			accounts.push( EM.create(Account, {
				name,
				mail: faker.internet.email(name),
				pass: faker.internet.password(),
				salt: "",
				regDate: faker.date.past(),
				token: faker.datatype.hexaDecimal(96).substring(2).toLowerCase(),
			}) );
		}
		return accounts.sort((a, b) => (a.regDate < b.regDate ? -1 : 1));
	}

	static getLocations(): Location[] {
		const locations: Location[] = [];

		const location = EM.create(Location, {
			name: "world"
		});
		locations.push(location);

		return locations;
	}

	static getUsers(accounts: Account[], locations: Location[]): User[] {
		const users: User[] = [];
		for (let i = 0; i < 10; i++) {
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