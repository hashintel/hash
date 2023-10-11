import { EntityPropertyValue, VersionedUrl } from "@blockprotocol/graph";
import { Entity, LinkData, OwnedById } from "@local/hash-subgraph";

import { setSuccessBadge } from "../../shared/badge";
import { CreateEntitiesRequest } from "../../shared/messages";
import { queryApi } from "../../shared/query-api";
import { CreationStatuses, setInSessionStorage } from "../../shared/storage";

const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $ownedById: OwnedById
    $properties: EntityPropertiesObject!
    $linkData: LinkData
  ) {
    # This is a scalar, which has no selection.
    createEntity(
      entityTypeId: $entityTypeId
      ownedById: $ownedById
      properties: $properties
      linkData: $linkData
    )
  }
`;

const createEntity = (variables: {
  entityTypeId: VersionedUrl;
  linkData?: LinkData;
  ownedById: OwnedById;
  properties: Record<string, EntityPropertyValue>;
}) => {
  return queryApi(createEntityMutation, variables).then(
    ({ data }: { data: { createEntity: Entity } }) => {
      return data.createEntity;
    },
  );
};

export const createEntities = async (message: CreateEntitiesRequest) => {
  const { entitiesToCreate, ownedById, skippedEntities } = message;

  let entityStatuses: CreationStatuses = {};
  for (const entity of entitiesToCreate) {
    entityStatuses[entity.entityId] = "pending";
  }
  for (const entity of skippedEntities) {
    entityStatuses[entity.entityId] = "skipped";
  }

  void setInSessionStorage("creationStatus", {
    entityStatuses,
    overallStatus: "pending",
  });

  try {
    await Promise.all(
      entitiesToCreate.map(async (entityToCreate) => {
        try {
          // @todo handle link entities – must be created after the entities they link
          const entity = await createEntity({
            entityTypeId: entityToCreate.entityTypeId,
            ownedById,
            properties: entityToCreate.properties,
          });

          entityStatuses = {
            ...entityStatuses,
            [entityToCreate.entityId]: entity.metadata.recordId.entityId,
          };

          void setInSessionStorage("creationStatus", {
            overallStatus: "pending",
            entityStatuses,
          });
        } catch (err) {
          entityStatuses = {
            ...entityStatuses,
            [entityToCreate.entityId]: "errored",
          };
          void setInSessionStorage("creationStatus", {
            overallStatus: "pending",
            entityStatuses,
          });
        }
      }),
    );
  } finally {
    void setInSessionStorage("creationStatus", {
      overallStatus: "complete",
      entityStatuses,
    });
    setSuccessBadge(
      Object.values(entityStatuses).filter((status) => status?.includes("~"))
        .length,
    );
  }
};
