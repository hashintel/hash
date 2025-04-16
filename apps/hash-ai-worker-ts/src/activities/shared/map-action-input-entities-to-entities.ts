import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  PersistedEntities,
  PersistedEntity,
} from "@local/hash-isomorphic-utils/flows/types";

export const mapActionInputEntitiesToEntities = (params: {
  inputEntities: (SerializedEntity | PersistedEntity | PersistedEntities)[];
}): HashEntity[] =>
  params.inputEntities.flatMap((inputEntity) => {
    if ("operation" in inputEntity) {
      if (inputEntity.entity) {
        return new HashEntity(inputEntity.entity);
      } else {
        return [];
      }
    }

    if ("persistedEntities" in inputEntity) {
      return inputEntity.persistedEntities.flatMap(
        ({ entity, existingEntity }) =>
          entity
            ? new HashEntity(entity)
            : existingEntity
              ? new HashEntity(existingEntity)
              : [],
      );
    }

    return new HashEntity(inputEntity);
  });
