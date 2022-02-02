import {
  EntityStoreType,
  isBlockEntity,
  isEntity,
} from "@hashintel/hash-shared/entityStore";
import { getRequiredEnv } from "../util";

export const COLLAB_QUEUE_NAME = getRequiredEnv("HASH_COLLAB_QUEUE_NAME");

export const walkValueForEntity = (
  value: unknown,
  entityHandler: (entity: EntityStoreType, blockId: string) => void,
  blockId: string | null = null,
) => {
  if (typeof value === "object" && value !== null) {
    let blockEntityId = blockId;

    if (isBlockEntity(value)) {
      blockEntityId = value.entityId;
    }

    for (const innerValue of Object.values(value)) {
      walkValueForEntity(innerValue, entityHandler, blockEntityId);
    }

    if (isEntity(value)) {
      if (!blockEntityId) {
        throw new Error("Missing block entity id");
      }

      entityHandler(value, blockEntityId);
    }
  }
};
