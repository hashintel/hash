import { VersionedUri } from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { AuthenticatedUser } from "../../../../../lib/user";

export const useCreateNewEntityAndRedirect = () => {
  const router = useRouter();
  const { createEntity } = useBlockProtocolCreateEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();

  const createNewEntityAndRedirect = useCallback(
    async (
      authenticatedUser: AuthenticatedUser,
      entityTypeId: VersionedUri,
      replace = false,
      abortSignal?: AbortSignal,
    ) => {
      const { data: subgraph } = await getEntityType({
        data: {
          entityTypeId,
          graphResolveDepths: {
            constrainsValuesOn: { outgoing: 0 },
            constrainsLinksOn: { outgoing: 0 },
            constrainsLinkDestinationsOn: { outgoing: 0 },
            constrainsPropertiesOn: { outgoing: 1 },
          },
        },
      });

      if (abortSignal?.aborted) {
        return;
      }

      const accountSlug = router.query["account-slug"];

      if (typeof accountSlug !== "string") {
        throw new Error("account slug not found");
      }

      if (!subgraph) {
        throw new Error("subgraph not found");
      }

      const { schema: entityType } =
        getEntityTypeById(subgraph, entityTypeId) ?? {};

      if (!entityType) {
        throw new Error("persisted entity type not found");
      }

      let ownedById: string | undefined;
      const shortname = accountSlug?.slice(1);

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

      const { data: entity } = await createEntity({
        data: {
          entityTypeId: entityType.$id,
          ownedById,
          properties: {},
        },
      });

      if (!entity) {
        throw new Error("Failed to create entity");
      }

      const entityId = extractEntityUuidFromEntityId(
        entity.metadata.editionId.baseId,
      );

      if (!abortSignal?.aborted) {
        const url = `/${accountSlug}/entities/${entityId}`;
        if (replace) {
          await router.replace(url);
        } else {
          await router.push(url);
        }
      }
    },
    [router, createEntity, getEntityType],
  );

  return createNewEntityAndRedirect;
};
