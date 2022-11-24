import { useRouter } from "next/router";
import { useCallback } from "react";
import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { useAuthenticatedUser } from "../../../../../components/hooks/useAuthenticatedUser";
import { getPersistedEntityType } from "../../../../../lib/subgraph";
import { generateDefaultProperties } from "./use-create-new-entity-and-redirect/generate-default-properties";

export const useCreateNewEntityAndRedirect = () => {
  const router = useRouter();
  const { createEntity } = useBlockProtocolCreateEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { authenticatedUser } = useAuthenticatedUser();

  const createNewEntityAndRedirect = useCallback(
    async (entityTypeId: string) => {
      const { data: subgraph } = await getEntityType({
        data: { entityTypeId },
      });

      if (!subgraph) {
        throw new Error("subgraph not found");
      }

      const { inner } = getPersistedEntityType(subgraph, entityTypeId) ?? {};

      if (!inner) {
        throw new Error("persisted entity type not found");
      }

      const entityType = inner;

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

      await router.push(
        `/@${authenticatedUser?.shortname}/entities/${entity.data?.entityId}`,
      );
    },
    [router, createEntity, getEntityType, authenticatedUser],
  );

  return createNewEntityAndRedirect;
};
