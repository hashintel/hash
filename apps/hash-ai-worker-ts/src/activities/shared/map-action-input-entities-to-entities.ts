import type { SimpleEntity } from "@local/hash-graph-types/entity";
import type {
  PersistedEntities,
  PersistedEntity,
} from "@local/hash-isomorphic-utils/flows/types";

export const mapActionInputEntitiesToEntities = (params: {
  inputEntities: (SimpleEntity | PersistedEntity | PersistedEntities)[];
}): SimpleEntity[] =>
  params.inputEntities.flatMap((inputEntity) =>
    "metadata" in inputEntity
      ? inputEntity
      : "persistedEntities" in inputEntity
        ? inputEntity.persistedEntities.flatMap(
            ({ entity, existingEntity }) => entity ?? existingEntity ?? [],
          )
        : inputEntity.entity ?? [],
  );
