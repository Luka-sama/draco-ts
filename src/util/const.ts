export default class Const {
	/** X-coordinate of neighboring tiles */
	static readonly NEIGHBORING_X = [0, -1, 1];
	/** Y-coordinate of neighboring tiles (for staggered maps) */
	static readonly NEIGHBORING_Y = [0, -1, 1, -2, 2];

	/** How often the game loop is executed */
	static readonly GAME_LOOP_FREQUENCY_MS = 16;

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

	/** Count of created lights groups per user */
	static readonly LIGHTS_GROUPS_PER_USER = 3;
	/** Min count of lights per lights group (not less than 1) */
	static readonly LIGHTS_MIN_COUNT_PER_GROUP = 1;
	/** Max count of lights per lights group (not less than 1) */
	static readonly LIGHTS_MAX_COUNT_PER_GROUP = 5;
	/** Lights group min speed (tiles per second) */
	static readonly LIGHTS_MIN_SPEED = 7;
	/** Lights group max speed (tiles per second) */
	static readonly LIGHTS_MAX_SPEED = 15;
	/** The probability (from 0 to 100) that a lights group will take a random direction */
	static readonly LIGHTS_RANDOM_DIRECTION_PROBABILITY = 25;
	/** The max possible distance from the target mage (the more, the greater the load on the server may be) */
	static readonly LIGHTS_MAX_POSSIBLE_DISTANCE_FROM_TARGET = 4;
	/** The probability (from 0 to 100) that a lights group will change their direction after the movement */
	static readonly LIGHTS_DIRECTION_CHANGE_PROBABILITY = 33;
}