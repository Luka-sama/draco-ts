import "reflect-metadata";
import AdminApp from "./admin.app";
import GameApp from "./game.app";

(async function() {
	await GameApp.init();
	await AdminApp.init();
})();