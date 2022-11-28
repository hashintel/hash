import { VersionedUri } from "@blockprotocol/type-system-web";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
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

      const accountSlug = router.query["account-slug"];

      if (typeof accountSlug !== "string") {
        throw new Error("account slug not found");
      }

      if (!subgraph) {
        throw new Error("subgraph not found");
      }

      if (!authenticatedUser) {
        throw new Error("user not found");
      }

      const { schema: entityType, metadata } =
        getEntityTypeById(subgraph, entityTypeId) ?? {};

      if (!entityType || !metadata) {
        throw new Error("persisted entity type not found");
      }

      let ownedById: string | undefined;
      const shortname = accountSlug?.split("@")[1];

      const atUsersNamespace = shortname === authenticatedUser.shortname;

      const foundOrg = authenticatedUser.memberOf.find(
        (val) => val.shortname === shortname,
      );
      const atOrgsNamespace = !!foundOrg;

      if (atUsersNamespace) {
        ownedById = extractEntityUuidFromEntityId(
          authenticatedUser.entityEditionId.baseId,
        );
      } else if (atOrgsNamespace) {
        /**
         * @todo  we should be using `extractEntityUuidFromEntityId` here instead,
         * but it's not possible for now
         * @see https://hashintel.slack.com/archives/C022217GAHF/p1669644710424819 (internal) for details
         */
        ownedById = extractOwnedByIdFromEntityId(
          foundOrg.entityEditionId.baseId,
        );
      }

      const entity = await createEntity({
        data: {
          entityTypeId: entityType.$id,
          ownedById,
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

      await router.push(`/${accountSlug}/entities/${entityId}`);
    },
    [router, createEntity, getEntityType, authenticatedUser],
  );

  return createNewEntityAndRedirect;
};
