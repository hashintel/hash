import { useMutation } from "@apollo/client";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { useBlockProtocolArchiveEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { createEntityMutation } from "../../../../../graphql/queries/knowledge/entity.queries";
import {
  DraftLinksToArchive,
  DraftLinksToCreate,
} from "./use-draft-link-state";

export const useApplyDraftLinkEntityChanges = () => {
  const { archiveEntity } = useBlockProtocolArchiveEntity();

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const applyDraftLinkEntityChanges = async (
    leftEntity: Entity,
    draftLinksToCreate: DraftLinksToCreate,
    draftLinksToArchive: DraftLinksToArchive,
  ) => {
    const archivePromises = draftLinksToArchive.map((linkEntityId) =>
      archiveEntity({ data: { entityId: linkEntityId } }),
    );

    const leftEntityId = leftEntity.metadata.recordId.entityId;

    const createPromises = draftLinksToCreate.map(
      ({ linkEntity, rightEntity }) =>
        createEntity({
          variables: {
            entityTypeId: linkEntity.metadata.entityTypeId,
            // The link should be in the same web as the source entity.
            ownedById: extractOwnedByIdFromEntityId(leftEntityId),
            properties: {},
            linkData: {
              leftEntityId,
              rightEntityId: rightEntity.metadata.recordId.entityId,
            },
            draft: leftEntity.metadata.draft,
          },
        }),
    );

    await Promise.all([...archivePromises, ...createPromises]);
  };

  return applyDraftLinkEntityChanges;
};
