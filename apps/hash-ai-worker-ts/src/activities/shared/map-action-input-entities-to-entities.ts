import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  PersistedEntities,
  PersistedEntity,
} from "@local/hash-isomorphic-utils/flows/types";

export const mapActionInputEntitiesToEntities = (params: {
  inputEntities: (SerializedEntity | PersistedEntity | PersistedEntities)[];
}): Entity[] =>
  params.inputEntities.flatMap((inputEntity) => {
    if ("operation" in inputEntity) {
      if (inputEntity.entity) {
        return new Entity(inputEntity.entity);
      } else {
        return [];
      }
    }

    if ("persistedEntities" in inputEntity) {
      return inputEntity.persistedEntities.flatMap(
        ({ entity, existingEntity }) =>
          entity
            ? new Entity(entity)
            : existingEntity
              ? new Entity(existingEntity)
              : [],
      );
    }

    return new Entity(inputEntity);
  });
