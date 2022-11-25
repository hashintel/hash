import { VersionedUri } from "@blockprotocol/type-system-web";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { useAuthenticatedUser } from "../../../../../components/hooks/useAuthenticatedUser";
import { generateDefaultProperties } from "./use-create-new-entity-and-redirect/generate-default-properties";

export const useCreateNewEntityAndRedirect = () => {
  const router = useRouter();
  const { createEntity } = useBlockProtocolCreateEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { authenticatedUser } = useAuthenticatedUser();

  const createNewEntityAndRedirect = useCallback(
    async (entityTypeId: VersionedUri) => {
      const { data: subgraph } = await getEntityType({
        data: entityTypeId,
      });

      if (!subgraph) {
        throw new Error("subgraph not found");
      }

      const entityType = getEntityTypeById(subgraph, entityTypeId)?.schema;

      if (!entityType) {
        throw new Error("persisted entity type not found");
      }

      const entity = await createEntity({
        data: {
          entityTypeId: entityType.$id,
          /**
           * @todo after implementing this ticket: https://app.asana.com/0/1203312852763953/1203433085114587/f (internal)
           * we should just use `properties: {}` here, and delete `generateDefaultProperties` function,
           * this is a temporary workaround for entity table to show the rows with empty values
           */
          properties: generateDefaultProperties(
            entityType.properties,
            subgraph,
          ),
        },
      });

      const entityId = extractEntityUuidFromEntityId(
        entity.data?.metadata.editionId.baseId!,
      );

      await router.push(
        `/@${authenticatedUser?.shortname}/entities/${entityId}`,
      );
    },
    [router, createEntity, getEntityType, authenticatedUser],
  );

  return createNewEntityAndRedirect;
};
