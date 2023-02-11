export default class Const {
	/** X-coordinate of neighboring tiles */
	static readonly NEIGHBORING_X = [0, -1, 1];
	/** Y-coordinate of neighboring tiles (for staggered maps) */
	static readonly NEIGHBORING_Y = [0, -1, 1, -2, 2];

	/** Cache should be cleaned every .. ms */
	static readonly CACHE_CLEAN_FREQUENCY_MS = 500;
	/**
	 * Default cache duration. It makes no sense to set this value lower than CACHE_CLEAN_FREQUENCY_MS.
	 * See also {@link CacheOptions.duration} for details
	 */
	static readonly CACHE_DEFAULT_DURATION_MS = 5000;

	/** Sync all updates with clients every .. ms */
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