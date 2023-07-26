import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity } from "@local/hash-subgraph";

export const supportedTypeIds = Object.values(linearTypes.entityType).map(
  (entityType) => entityType.entityTypeId,
);

export const processEntityChange = (entity: Entity) => {
  const { entityTypeId } = entity.metadata;

  if (!supportedTypeIds.includes(entityTypeId)) {
    throw new Error(
      `Entity with entity type ${entityTypeId} passed to Linear write back processor – supported types are ${supportedTypeIds.join(
        ", ",
      )}.`,
    );
  }

  switch (entityTypeId) {
    case linearTypes.entityType.issue.entityTypeId:
      // eslint-disable-next-line no-console
      console.log("Change to Linear Issue detected");
    // @todo trigger appropriate workflow
  }
};
