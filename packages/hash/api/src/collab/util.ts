import { BlockEntity } from "@hashintel/hash-shared/entity";
import {
  EntityStoreType,
  isBlockEntity,
  isEntity,
} from "@hashintel/hash-shared/entityStore";
import { getRequiredEnv } from "../util";

export const COLLAB_QUEUE_NAME = getRequiredEnv("HASH_COLLAB_QUEUE_NAME");

export const walkValueForEntity = (
  value: unknown,
  entityHandler: (entity: EntityStoreType, block: BlockEntity) => void,
  parentBlock: BlockEntity | null = null,
) => {
  if (typeof value === "object" && value !== null) {
    let blockEntity = parentBlock;

    if (isBlockEntity(value)) {
      blockEntity = value;
    }

    for (const innerValue of Object.values(value)) {
      walkValueForEntity(innerValue, entityHandler, blockEntity);
    }

    if (isEntity(value)) {
      if (!blockEntity) {
        throw new Error("Missing block entity");
      }

      entityHandler(value, blockEntity);
    }
  }
};
