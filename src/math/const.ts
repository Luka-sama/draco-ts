export default class Const {
	static readonly SYNC_FREQUENCY_MS = 10;

	/** Walk speed (tiles per second) */
	static readonly MOVEMENT_WALK_SPEED = 7;
	/** Run speed (tiles per second) */
	static readonly MOVEMENT_RUN_SPEED = 15;

	/** Delete message from chat after .. ms */
	static readonly CHAT_DELETE_MESSAGE_AFTER_MS = 300 * 1000;
	/** Hearing radius (in tiles) */
	static readonly CHAT_HEARING_RADIUS = 30;
}