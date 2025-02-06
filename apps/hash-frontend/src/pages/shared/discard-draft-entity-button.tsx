import { useMutation } from "@apollo/client";
import { AlertModal } from "@hashintel/design-system";
import { type Entity } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityType } from "@local/hash-graph-types/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import {
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
} from "@local/hash-subgraph/stdlib";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import type {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { archiveEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { useNotificationCount } from "../../shared/notification-count-context";
import type { ButtonProps } from "../../shared/ui";
import { Button } from "../../shared/ui";

export const DiscardDraftEntityButton: FunctionComponent<
  {
    closedMultiEntityType: ClosedMultiEntityType;
    draftEntity: Entity;
    draftEntitySubgraph: Subgraph<EntityRootType>;
    onDiscardedEntity?: () => void;
  } & ButtonProps
> = ({
  closedMultiEntityType,
  draftEntity,
  draftEntitySubgraph,
  onDiscardedEntity,
  ...buttonProps
}) => {
  const { archiveNotificationsForEntity } = useNotificationCount();

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const discardDraftEntity = useCallback(
    async (params: { draftEntity: Entity }) => {
      await archiveNotificationsForEntity({
        targetEntityId: params.draftEntity.entityId,
      });
      await archiveEntity({
        variables: {
          entityId: params.draftEntity.metadata.recordId.entityId,
        },
      });
    },
    [archiveEntity, archiveNotificationsForEntity],
  );

  const [
    showDraftEntityWithDraftLinksWarning,
    setShowDraftEntityWithDraftLinksWarning,
  ] = useState(false);

  const isLinkEntity = !!draftEntity.linkData;

  const incomingDraftLinks = useMemo(
    () =>
      isLinkEntity
        ? undefined
        : getIncomingLinksForEntity(
            draftEntitySubgraph,
            draftEntity.metadata.recordId.entityId,
          ).filter(
            (linkEntity) =>
              !!extractDraftIdFromEntityId(
                linkEntity.metadata.recordId.entityId,
              ),
          ),
    [draftEntitySubgraph, draftEntity, isLinkEntity],
  );

  const outgoingDraftLinks = useMemo(
    () =>
      isLinkEntity
        ? undefined
        : getOutgoingLinksForEntity(
            draftEntitySubgraph,
            draftEntity.metadata.recordId.entityId,
          ).filter(
            (linkEntity) =>
              !!extractDraftIdFromEntityId(
                linkEntity.metadata.recordId.entityId,
              ),
          ),
    [draftEntitySubgraph, draftEntity, isLinkEntity],
  );

  const hasIncomingOrOutgoingDraftLinks = useMemo(
    () =>
      (outgoingDraftLinks && outgoingDraftLinks.length > 0) ||
      (incomingDraftLinks && incomingDraftLinks.length > 0),
    [outgoingDraftLinks, incomingDraftLinks],
  );

  const handleIgnore = useCallback(async () => {
    if (hasIncomingOrOutgoingDraftLinks) {
      setShowDraftEntityWithDraftLinksWarning(true);
    } else {
      await discardDraftEntity({ draftEntity });
      onDiscardedEntity?.();
    }
  }, [
    hasIncomingOrOutgoingDraftLinks,
    draftEntity,
    discardDraftEntity,
    onDiscardedEntity,
  ]);

  const handleIgnoreDraftEntityWithDraftLinks = useCallback(async () => {
    await Promise.all(
      [...(incomingDraftLinks ?? []), ...(outgoingDraftLinks ?? [])].map(
        (linkEntity) =>
          discardDraftEntity({
            draftEntity: linkEntity,
          }),
      ),
    );

    await discardDraftEntity({ draftEntity });

    onDiscardedEntity?.();
  }, [
    incomingDraftLinks,
    outgoingDraftLinks,
    draftEntity,
    discardDraftEntity,
    onDiscardedEntity,
  ]);

  const label = useMemo(() => {
    return generateEntityLabel(closedMultiEntityType, draftEntity);
  }, [closedMultiEntityType, draftEntity]);

  return (
    <>
      {showDraftEntityWithDraftLinksWarning && (
        <AlertModal
          callback={handleIgnoreDraftEntityWithDraftLinks}
          calloutMessage={
            <>
              The <strong>{label}</strong> draft entity has{" "}
              {incomingDraftLinks && incomingDraftLinks.length > 0 ? (
                <strong>
                  {incomingDraftLinks.length} draft incoming link
                  {incomingDraftLinks.length > 1 ? "s" : ""}
                </strong>
              ) : null}{" "}
              {outgoingDraftLinks && outgoingDraftLinks.length > 0 ? (
                <>
                  {incomingDraftLinks && incomingDraftLinks.length > 0
                    ? " and "
                    : null}
                  <strong>
                    {outgoingDraftLinks.length} draft outgoing link
                    {outgoingDraftLinks.length > 1 ? "s" : ""}
                  </strong>
                </>
              ) : null}{" "}
              which will be ignored as well.
            </>
          }
          close={() => setShowDraftEntityWithDraftLinksWarning(false)}
          header={
            <>
              Ignore draft entity: <strong>{label}</strong>
            </>
          }
          type="info"
        />
      )}
      <Button onClick={handleIgnore} {...buttonProps} />
    </>
  );
};
