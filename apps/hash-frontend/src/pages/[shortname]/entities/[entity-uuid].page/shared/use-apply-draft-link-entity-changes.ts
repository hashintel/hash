import { EntityId } from "@local/hash-subgraph";
import { OwnedById } from "@local/hash-subgraph/src/types";
import { useContext } from "react";

import { useBlockProtocolArchiveEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import {
  DraftLinksToArchive,
  DraftLinksToCreate,
} from "./use-draft-link-state";

export const useApplyDraftLinkEntityChanges = () => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const { archiveEntity } = useBlockProtocolArchiveEntity();

  const { createEntity } = useBlockProtocolCreateEntity(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (activeWorkspaceAccountId as OwnedById) ?? null,
  );

  const applyDraftLinkEntityChanges = async (
    leftEntityId: EntityId,
    draftLinksToCreate: DraftLinksToCreate,
    draftLinksToArchive: DraftLinksToArchive,
  ) => {
    const archivePromises = draftLinksToArchive.map((linkEntityId) =>
      archiveEntity({ data: { entityId: linkEntityId } }),
    );

    const createPromises = draftLinksToCreate.map(
      ({ linkEntity, rightEntity }) =>
        createEntity({
          data: {
            entityTypeId: linkEntity.metadata.entityTypeId,
            properties: {},
            linkData: {
              leftEntityId,
              rightEntityId: rightEntity.metadata.recordId.entityId,
            },
          },
        }),
    );

    await Promise.all([...archivePromises, ...createPromises]);
  };

  return applyDraftLinkEntityChanges;
};
