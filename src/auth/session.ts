import Tr from "../draco-ts/tr.js";
import MapUtil from "../draco-ts/util/map-util.js";
import WS, {Socket} from "../draco-ts/ws.js";
import Account from "./account.entity.js";
import User from "./user.entity.js";

export default class Session {
	private static accountBySocket = new Map<Socket, Account>;
	private static userBySocket = new Map<Socket, User>;
	private static socketsByAccount = new Map<Account, Set<Socket>>;
	private static socketsByUser = new Map<User, Set<Socket>>;

	static init() {
		WS.emitter.on("close", Session.logOutAccount);
		WS.emitter.on("error", Session.onError);
	}

	static getAccountBySocket(socket: Socket): Account | undefined {
		return Session.accountBySocket.get(socket);
	}

	static getUserBySocket(socket: Socket): User | undefined {
		return Session.userBySocket.get(socket);
	}

	static getSocketsByAccount(account: Account): Set<Socket> {
		return Session.socketsByAccount.get(account) || new Set;
	}

	static getSocketsByUser(user: User): Set<Socket> {
		return Session.socketsByUser.get(user) || new Set;
	}

	static isLoggedIntoAccount(socket: Socket): boolean {
		return Session.accountBySocket.has(socket);
	}

	static isLoggedAsUser(socket: Socket): boolean {
		return Session.userBySocket.has(socket);
	}

	static isAccountConnected(account: Account): boolean {
		return Session.socketsByAccount.has(account);
	}

	static isUserConnected(user: User): boolean {
		return Session.socketsByUser.has(user);
	}

	static signInAccount(socket: Socket, account: Account): void {
		Session.accountBySocket.set(socket, account);
		MapUtil.getSet(Session.socketsByAccount, account).add(socket);
	}

	static signInUser(socket: Socket, user: User): void {
		Session.userBySocket.set(socket, user);
		MapUtil.getSet(Session.socketsByUser, user).add(socket);
	}

	static logOutAccount(socket: Socket): void {
		Session.logOutUser(socket);
		const account = Session.accountBySocket.get(socket);
		if (!account) {
			return;
		}
		Session.accountBySocket.delete(socket);
		const sockets = MapUtil.getSet(Session.socketsByAccount, account);
		sockets.delete(socket);
		if (sockets.size < 1) {
			Session.socketsByAccount.delete(account);
		}
	}

	static logOutUser(socket: Socket): void {
		const user = Session.userBySocket.get(socket);
		if (!user) {
			return;
		}
		Session.userBySocket.delete(socket);
		const sockets = MapUtil.getSet(Session.socketsByUser, user);
		sockets.delete(socket);
		if (sockets.size < 1) {
			Session.socketsByUser.delete(user);
		}
	}

	static logOutAccountFromAllSockets(account: Account): void {
		const sockets = MapUtil.getSet(Session.socketsByAccount, account);
		for (const socket of sockets) {
			Session.accountBySocket.delete(socket);
		}
		Session.socketsByAccount.delete(account);
	}

	static logOutUserFromAllSockets(user: User): void {
		const sockets = MapUtil.getSet(Session.socketsByUser, user);
		for (const socket of sockets) {
			Session.userBySocket.delete(socket);
		}
		Session.socketsByUser.delete(user);
	}

	private static onError(sck: Socket, isWrongData: boolean): void {
		const text = (isWrongData ? Tr.get("WRONG_DATA") : Tr.get("UNKNOWN_ERROR"));
		sck.emit("info", {text});
	}
}