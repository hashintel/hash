import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type {
  PersistedEntities,
  PersistedEntity,
} from "@local/hash-isomorphic-utils/flows/types";

export const mapActionInputEntitiesToEntities = (params: {
  inputEntities: (SerializedEntity | PersistedEntity | PersistedEntities)[];
}): SerializedEntity[] =>
  params.inputEntities.flatMap((inputEntity) =>
    "metadata" in inputEntity
      ? inputEntity
      : "persistedEntities" in inputEntity
        ? inputEntity.persistedEntities.flatMap(
            ({ entity, existingEntity }) => entity ?? existingEntity ?? [],
          )
        : inputEntity.entity ?? [],
  );
