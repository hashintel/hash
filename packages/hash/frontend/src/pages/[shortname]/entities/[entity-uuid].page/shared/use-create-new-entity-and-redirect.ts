import { VersionedUri } from "@blockprotocol/type-system";
import { OwnedById } from "@hashintel/hash-shared/types";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useRouter } from "next/router";
import { useCallback, useContext } from "react";

import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { WorkspaceContext } from "../../../../shared/workspace-context";

export const useCreateNewEntityAndRedirect = () => {
  const router = useRouter();
  const { activeWorkspace, activeWorkspaceAccountId } =
    useContext(WorkspaceContext);
  const { createEntity } = useBlockProtocolCreateEntity(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (activeWorkspaceAccountId as OwnedById) ?? null,
  );
  const { getEntityType } = useBlockProtocolGetEntityType();

  const createNewEntityAndRedirect = useCallback(
    async (
      entityTypeId: VersionedUri,
      replace = false,
      abortSignal?: AbortSignal,
    ) => {
      if (!activeWorkspace) {
        throw new Error("Active workspace must be set");
      }

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

      if (!subgraph) {
        throw new Error("subgraph not found");
      }

      const { schema: entityType } =
        getEntityTypeById(subgraph, entityTypeId) ?? {};

      if (!entityType) {
        throw new Error("persisted entity type not found");
      }

      const { data: entity } = await createEntity({
        data: {
          entityTypeId: entityType.$id,
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
        const url = `/@${activeWorkspace.shortname}/entities/${entityId}`;
        if (replace) {
          await router.replace(url);
        } else {
          await router.push(url);
        }
      }
    },
    [router, activeWorkspace, createEntity, getEntityType],
  );

  return createNewEntityAndRedirect;
};
