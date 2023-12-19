import { useMutation } from "@apollo/client";
import { AlertModal, FeatherRegularIcon } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph/.";
import { getEntityRevision } from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { BoxProps, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";

import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../../shared/draft-entities-context";
import { CheckRegularIcon } from "../../shared/icons/check-regular-icon";
import { useNotifications } from "../../shared/notifications-context";
import { Button, ButtonProps } from "../../shared/ui";
import { LinkLabelWithSourceAndDestination } from "./link-label-with-source-and-destination";
import { useNotificationsWithLinks } from "./use-notifications-with-links";

const LeftOrRightEntityEndAdornment: FunctionComponent<{
  isDraft: boolean;
}> = ({ isDraft }) => (
  <Typography
    sx={{
      position: "relative",
      top: 1,
      color: ({ palette }) => (isDraft ? palette.gray[50] : palette.blue[70]),
      fontSize: 11,
      fontWeight: isDraft ? 500 : 600,
      svg: {
        fontSize: 11,
        marginRight: 0.5,
        position: "relative",
        top: 1,
      },
    }}
  >
    {isDraft ? (
      <>
        <FeatherRegularIcon />
        Draft
      </>
    ) : (
      <>
        <CheckRegularIcon />
        Live
      </>
    )}
  </Typography>
);

const getRightOrLeftEntitySx = (params: {
  isDraft: boolean;
}): BoxProps["sx"] =>
  params.isDraft
    ? {
        backgroundColor: ({ palette }) => palette.gray[15],
      }
    : {
        borderColor: "#B7DAF7",
        background: ({ palette }) => palette.blue[20],
      };

export const AcceptDraftEntityButton: FunctionComponent<
  {
    draftEntity: Entity;
    draftEntitySubgraph: Subgraph<EntityRootType>;
    onAcceptedEntity?: (acceptedEntity: Entity) => void;
  } & ButtonProps
> = ({
  draftEntity,
  draftEntitySubgraph,
  onAcceptedEntity,
  ...buttonProps
}) => {
  const [
    showDraftLinkEntityWithDraftLeftOrRightEntityWarning,
    setShowDraftLinkEntityWithDraftLeftOrRightEntityWarning,
  ] = useState(false);

  const { draftLeftEntity, draftRightEntity } = useMemo(() => {
    if (draftEntity.linkData) {
      const leftEntity = getEntityRevision(
        draftEntitySubgraph,
        draftEntity.linkData.leftEntityId,
      );

      if (!leftEntity) {
        throw new Error("Left entity of link entity not found in subgraph.");
      }

      const rightEntity = getEntityRevision(
        draftEntitySubgraph,
        draftEntity.linkData.rightEntityId,
      );

      if (!rightEntity) {
        throw new Error("Right entity of link entity not found in subgraph.");
      }

      return {
        draftLeftEntity: leftEntity.metadata.draft ? leftEntity : undefined,
        draftRightEntity: rightEntity.metadata.draft ? rightEntity : undefined,
      };
    }

    return {};
  }, [draftEntity, draftEntitySubgraph]);

  const hasLeftOrRightDraftEntity = !!draftLeftEntity || !!draftRightEntity;

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const { refetch: refetchDraftEntities } = useDraftEntities();

  const { markNotificationAsRead } = useNotifications();
  const { notifications } = useNotificationsWithLinks();

  const markRelatedGraphChangeNotificationsAsRead = useCallback(
    async (params: { draftEntity: Entity }) => {
      const relatedGraphChangeNotifications =
        notifications?.filter(
          ({ kind, occurredInEntity }) =>
            kind === "graph-change" &&
            occurredInEntity.metadata.recordId.entityId ===
              params.draftEntity.metadata.recordId.entityId,
        ) ?? [];

      await Promise.all(
        relatedGraphChangeNotifications.map((notification) =>
          markNotificationAsRead({ notificationEntity: notification.entity }),
        ),
      );
    },
    [notifications, markNotificationAsRead],
  );

  const acceptDraftEntity = useCallback(
    async (params: { draftEntity: Entity }) => {
      await markRelatedGraphChangeNotificationsAsRead(params);

      const response = await updateEntity({
        variables: {
          entityId: params.draftEntity.metadata.recordId.entityId,
          updatedProperties: params.draftEntity.properties,
          draft: false,
        },
      });

      await refetchDraftEntities();

      if (!response.data) {
        throw new Error("An error occurred accepting the draft entity.");
      }

      return response.data.updateEntity;
    },
    [
      updateEntity,
      refetchDraftEntities,
      markRelatedGraphChangeNotificationsAsRead,
    ],
  );

  const handleAccept = useCallback(async () => {
    if (hasLeftOrRightDraftEntity) {
      setShowDraftLinkEntityWithDraftLeftOrRightEntityWarning(true);
    } else {
      const acceptedEntity = await acceptDraftEntity({ draftEntity });
      onAcceptedEntity?.(acceptedEntity);
    }
  }, [
    onAcceptedEntity,
    hasLeftOrRightDraftEntity,
    acceptDraftEntity,
    draftEntity,
  ]);

  const handleAcceptDraftLinkEntityWithDraftLeftOrRightEntities =
    useCallback(async () => {
      await Promise.all(
        [draftLeftEntity ?? [], draftRightEntity ?? []]
          .flat()
          .map((draftLinkedEntity) =>
            acceptDraftEntity({ draftEntity: draftLinkedEntity }),
          ),
      );

      await acceptDraftEntity({
        draftEntity,
      });
    }, [draftLeftEntity, draftEntity, draftRightEntity, acceptDraftEntity]);

  const label = useMemo(
    () => generateEntityLabel(draftEntitySubgraph, draftEntity),
    [draftEntitySubgraph, draftEntity],
  );

  return (
    <>
      {showDraftLinkEntityWithDraftLeftOrRightEntityWarning && (
        <AlertModal
          callback={handleAcceptDraftLinkEntityWithDraftLeftOrRightEntities}
          calloutMessage={
            <>
              This <strong>{label}</strong> link establishes a relationship{" "}
              {draftLeftEntity && draftRightEntity
                ? "between two other entities which are in draft, which will be accepted as well."
                : draftLeftEntity
                  ? "between a draft entity, and a published entity. If you continue the former will be accepted as well."
                  : "between a published entity, and a draft entity. If you continue the latter will be accepted as well."}
            </>
          }
          close={() =>
            setShowDraftLinkEntityWithDraftLeftOrRightEntityWarning(false)
          }
          header={
            <>
              Accept draft link: <strong>{label}</strong>
            </>
          }
          type="info"
        >
          <LinkLabelWithSourceAndDestination
            openInNew
            linkEntity={draftEntity as LinkEntity}
            subgraph={draftEntitySubgraph}
            leftEntityEndAdornment={
              <LeftOrRightEntityEndAdornment isDraft={!!draftLeftEntity} />
            }
            rightEntityEndAdornment={
              <LeftOrRightEntityEndAdornment isDraft={!!draftRightEntity} />
            }
            leftEntitySx={getRightOrLeftEntitySx({
              isDraft: !!draftLeftEntity,
            })}
            rightEntitySx={getRightOrLeftEntitySx({
              isDraft: !!draftRightEntity,
            })}
            displayLabels
          />
        </AlertModal>
      )}
      <Button onClick={handleAccept} {...buttonProps} />
    </>
  );
};
