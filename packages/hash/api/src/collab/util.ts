import {
  EntityStoreType,
  isBlockEntity,
  isEntity,
} from "@hashintel/hash-shared/entityStore";
import { getRequiredEnv } from "../util";

export const COLLAB_QUEUE_NAME = getRequiredEnv("HASH_COLLAB_QUEUE_NAME");

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

/**
 * @see https://stackoverflow.com/a/60142095
 */
const typeSafeEntries = <T>(obj: T): Entries<T> => Object.entries(obj) as any;

type EntityHandler = <E extends EntityStoreType>(
  entity: E,
  blockId: string,
) => E;

const walkObjectValueForEntity = <T extends {}>(
  value: T,
  entityHandler: EntityHandler,
  blockId: string | null,
): T => {
  let blockEntityId = blockId;

  if (isBlockEntity(value)) {
    blockEntityId = value.entityId;
  }

  let changed = false;
  let result = value;

  for (const [key, innerValue] of typeSafeEntries(value)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const nextValue = walkValueForEntity(
      innerValue,
      entityHandler,
      blockEntityId,
    );

    if (nextValue !== innerValue) {
      if (!changed) {
        result = (Array.isArray(value) ? [...value] : { ...value }) as T;
      }

      changed = true;
      result[key] = nextValue;
    }
  }

  if (isEntity(value)) {
    if (!blockEntityId) {
      throw new Error("Missing block entity id");
    }

    const nextValue = entityHandler(value, blockEntityId);

    if (nextValue !== value) {
      changed = true;
      result = nextValue;
    }
  }

  return changed ? result : value;
};

/**
 * @deprecated
 * @todo remove this when we have a flat entity store
 */
export const walkValueForEntity = <T>(
  value: T,
  entityHandler: EntityHandler,
  blockId: string | null = null,
): T => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return walkObjectValueForEntity(value, entityHandler, blockId);
};
