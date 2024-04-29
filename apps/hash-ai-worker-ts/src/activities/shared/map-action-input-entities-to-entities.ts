import type {
  PersistedEntities,
  PersistedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Entity } from "@local/hash-subgraph";

export const mapActionInputEntitiesToEntities = (params: {
  inputEntities: (Entity | PersistedEntity | PersistedEntities)[];
}): Entity[] =>
  params.inputEntities.flatMap((inputEntity) =>
    "metadata" in inputEntity
      ? inputEntity
      : "persistedEntities" in inputEntity
        ? inputEntity.persistedEntities.flatMap(
            ({ entity, existingEntity }) => entity ?? existingEntity ?? [],
          )
        : inputEntity.entity ?? [],
  );
