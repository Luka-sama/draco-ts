import Entity from "../orm/entity.js";
import WeakTask from "./weak-task.js";

/**
 * See {@link WeakTask} for details.
 *
 * The only difference to WeakTask is that this class is integrated with ORM.
 * That means that if your class extends `EntityTask<SomeEntity>`,
 * the ORM will automatically use this task for `SomeEntity` whenever an entity is loaded.
 */
export default abstract class EntityTask<T extends Entity> extends WeakTask<T> {}