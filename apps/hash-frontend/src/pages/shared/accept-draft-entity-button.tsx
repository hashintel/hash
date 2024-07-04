import { useMutation } from "@apollo/client";
import { AlertModal, FeatherRegularIcon } from "@hashintel/design-system";
import { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import { getEntityRevision } from "@local/hash-subgraph/stdlib";
import type { BoxProps } from "@mui/material";
import { Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../../shared/draft-entities-context";
import { CheckRegularIcon } from "../../shared/icons/check-regular-icon";
import { useNotificationEntities } from "../../shared/notification-entities-context";
import type { ButtonProps } from "../../shared/ui";
import { Button } from "../../shared/ui";
import { LinkLabelWithSourceAndDestination } from "./link-label-with-source-and-destination";
import { useNotificationsWithLinks } from "./notifications-with-links-context";

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
      textTransform: "uppercase",
      flexShrink: 0,
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
    onAcceptedEntity: ((acceptedEntity: Entity) => void) | null;
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

      const rightEntity = getEntityRevision(
        draftEntitySubgraph,
        draftEntity.linkData.rightEntityId,
      );

      return {
        /**
         * Note: if a left or right draft entity has already been archived, it
         * may not be present in the subgraph. This is why the `leftEntity` and
         * `rightEntity` are nullable in this context.
         */
        draftLeftEntity:
          leftEntity &&
          extractDraftIdFromEntityId(leftEntity.metadata.recordId.entityId)
            ? leftEntity
            : undefined,
        draftRightEntity:
          rightEntity &&
          extractDraftIdFromEntityId(rightEntity.metadata.recordId.entityId)
            ? rightEntity
            : undefined,
      };
    }

    return {};
  }, [draftEntity, draftEntitySubgraph]);

  const isUpdate =
    !!draftEntity.metadata.provenance.firstNonDraftCreatedAtDecisionTime;

  /**
   * Links cannot be made live without live left && right entities, so if this is a draft update to a live link
   * there must already be live left and right entities, and the user doesn't need to accept draft updates to
   * those at the same time – they may be unwanted.
   */
  const hasLeftOrRightDraftEntityThatMustBeUndrafted =
    !isUpdate && (!!draftLeftEntity || !!draftRightEntity);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const { refetch: refetchDraftEntities } = useDraftEntities();

  const { markNotificationAsRead } = useNotificationEntities();
  const { notifications } = useNotificationsWithLinks();

  /**
   * Notifications are no longer created for draft entities, but they will exist for existing draft entities.
   * Can be removed in the future – change to stop notifs for draft entities made in March 2024.
   */
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
          entityUpdate: {
            entityId: params.draftEntity.metadata.recordId.entityId,
            draft: false,
            propertyPatches: [],
          },
        },
      });

      await refetchDraftEntities();

      if (!response.data) {
        throw new Error("An error occurred accepting the draft entity.");
      }

      return new Entity(response.data.updateEntity);
    },
    [
      updateEntity,
      refetchDraftEntities,
      markRelatedGraphChangeNotificationsAsRead,
    ],
  );

  const handleAccept = useCallback(async () => {
    if (hasLeftOrRightDraftEntityThatMustBeUndrafted) {
      setShowDraftLinkEntityWithDraftLeftOrRightEntityWarning(true);
    } else {
      const acceptedEntity = await acceptDraftEntity({ draftEntity });
      onAcceptedEntity?.(acceptedEntity);
    }
  }, [
    onAcceptedEntity,
    hasLeftOrRightDraftEntityThatMustBeUndrafted,
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
          contentStyle={{
            width: {
              sm: "90%",
              md: 700,
            },
          }}
        >
          <LinkLabelWithSourceAndDestination
            sx={{
              maxWidth: "100%",
            }}
            openInNew
            linkEntity={new LinkEntity(draftEntity)}
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
