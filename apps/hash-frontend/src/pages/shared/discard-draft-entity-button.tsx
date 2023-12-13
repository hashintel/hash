import { AlertModal } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
} from "@local/hash-subgraph/stdlib";
import { FunctionComponent, useCallback, useMemo, useState } from "react";

import { useDraftEntities } from "../../shared/draft-entities-context";
import { Button, ButtonProps } from "../../shared/ui";

export const DiscardDraftEntityButton: FunctionComponent<
  {
    draftEntity: Entity;
    draftEntitySubgraph: Subgraph<EntityRootType>;
    onDiscardedEntity?: () => void;
  } & ButtonProps
> = ({
  draftEntity,
  draftEntitySubgraph,
  onDiscardedEntity,
  ...buttonProps
}) => {
  const { discardDraftEntity } = useDraftEntities();

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
          ).filter((linkEntity) => linkEntity.metadata.draft),
    [draftEntitySubgraph, draftEntity, isLinkEntity],
  );

  const outgoingDraftLinks = useMemo(
    () =>
      isLinkEntity
        ? undefined
        : getOutgoingLinksForEntity(
            draftEntitySubgraph,
            draftEntity.metadata.recordId.entityId,
          ).filter((linkEntity) => linkEntity.metadata.draft),
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

  const label = useMemo(
    () => generateEntityLabel(draftEntitySubgraph, draftEntity),
    [draftEntitySubgraph, draftEntity],
  );

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
