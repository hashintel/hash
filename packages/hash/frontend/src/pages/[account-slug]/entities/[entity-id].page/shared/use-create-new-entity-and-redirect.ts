import { EntityType } from "@blockprotocol/type-system-web";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { getPersistedEntityType } from "../../../../../lib/subgraph";

export const useCreateNewEntityAndRedirect = () => {
  const router = useRouter();
  const { createEntity } = useBlockProtocolCreateEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();

  const createNewEntityAndRedirect = useCallback(
    async (arg: { entityType: EntityType } | { entityTypeId: string }) => {
      let entityType: EntityType;

      if ("entityType" in arg) {
        entityType = arg.entityType;
      } else {
        const res = await getEntityType({
          data: { entityTypeId: arg.entityTypeId },
        });

        if (!res.data) {
          throw new Error("subgraph not found");
        }

        const { inner } =
          getPersistedEntityType(res.data, arg.entityTypeId) ?? {};

        if (!inner) {
          throw new Error("persisted entity type not found");
        }

        entityType = inner;
      }

      const properties: Record<string, unknown> = {};

      for (const propertyKey of Object.keys(entityType.properties)) {
        /**
         * @todo assigning empty string for each property to make them visible for now,
         * but need to make sure if this works with arrays & nested properties
         */
        properties[propertyKey] = "";
      }

      const entity = await createEntity({
        data: {
          entityTypeId: entityType.$id,
          properties,
        },
      });

      await router.push(`/@alice/entities/${entity.data?.entityId}`);
    },
    [router, createEntity, getEntityType],
  );

  return createNewEntityAndRedirect;
};
