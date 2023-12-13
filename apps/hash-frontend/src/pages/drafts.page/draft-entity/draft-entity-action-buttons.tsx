import { useMutation } from "@apollo/client";
import { AlertModal, CloseIcon } from "@hashintel/design-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { Box, BoxProps, buttonClasses, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";

import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  archiveEntityMutation,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../../../shared/draft-entities-context";
import { CheckRegularIcon } from "../../../shared/icons/check-regular-icon";
import { FeatherRegularIcon } from "../../../shared/icons/feather-regular-icon";
import { useNotifications } from "../../../shared/notifications-context";
import { Button } from "../../../shared/ui";
import { LinkLabelWithSourceAndDestination } from "../../shared/link-label-with-source-and-destination";

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

export const DraftEntityActionButtons: FunctionComponent<{
  label: string;
  entity: Entity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ entity, subgraph, label }) => {
  const { refetch: refetchDraftEntities } = useDraftEntities();

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const [
    showDraftEntityWithDraftLinksWarning,
    setShowDraftEntityWithDraftLinksWarning,
  ] = useState(false);
  const [
    showDraftLinkEntityWithDraftLeftOrRightEntityWarning,
    setShowDraftLinkEntityWithDraftLeftOrRightEntityWarning,
  ] = useState(false);

  const isLinkEntity = !!entity.linkData;

  const incomingDraftLinks = useMemo(
    () =>
      isLinkEntity
        ? undefined
        : getIncomingLinksForEntity(
            subgraph,
            entity.metadata.recordId.entityId,
          ).filter((linkEntity) => linkEntity.metadata.draft),
    [subgraph, entity, isLinkEntity],
  );

  const outgoingDraftLinks = useMemo(
    () =>
      isLinkEntity
        ? undefined
        : getOutgoingLinksForEntity(
            subgraph,
            entity.metadata.recordId.entityId,
          ).filter((linkEntity) => linkEntity.metadata.draft),
    [subgraph, entity, isLinkEntity],
  );

  const hasIncomingOrOutgoingDraftLinks = useMemo(
    () =>
      (outgoingDraftLinks && outgoingDraftLinks.length > 0) ||
      (incomingDraftLinks && incomingDraftLinks.length > 0),
    [outgoingDraftLinks, incomingDraftLinks],
  );

  const { notifications, archiveNotification } = useNotifications();

  const archiveRelatedNotifications = useCallback(async () => {
    const relatedNotifications = notifications?.filter(
      (notification) =>
        notification.occurredInEntity.metadata.recordId.entityId ===
        entity.metadata.recordId.entityId,
    );

    if (!relatedNotifications) {
      return;
    }

    await Promise.all(
      relatedNotifications.map((notification) => {
        return archiveNotification({
          notificationEntityId: notification.entity.metadata.recordId.entityId,
        });
      }),
    );
  }, [entity, notifications, archiveNotification]);

  const handleIgnore = useCallback(async () => {
    if (hasIncomingOrOutgoingDraftLinks) {
      setShowDraftEntityWithDraftLinksWarning(true);
    } else {
      await archiveRelatedNotifications();

      await archiveEntity({
        variables: {
          entityId: entity.metadata.recordId.entityId,
        },
      });

      await refetchDraftEntities();
    }
  }, [
    hasIncomingOrOutgoingDraftLinks,
    archiveEntity,
    entity,
    refetchDraftEntities,
    archiveRelatedNotifications,
  ]);

  const handleIgnoreDraftEntityWithDraftLinks = useCallback(async () => {
    await archiveRelatedNotifications();

    await Promise.all(
      [...(incomingDraftLinks ?? []), ...(outgoingDraftLinks ?? [])].map(
        (linkEntity) =>
          archiveEntity({
            variables: { entityId: linkEntity.metadata.recordId.entityId },
          }),
      ),
    );

    await archiveEntity({
      variables: { entityId: entity.metadata.recordId.entityId },
    });

    await refetchDraftEntities();
  }, [
    incomingDraftLinks,
    outgoingDraftLinks,
    entity,
    archiveEntity,
    refetchDraftEntities,
    archiveRelatedNotifications,
  ]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const { draftLeftEntity, draftRightEntity } = useMemo(() => {
    if (entity.linkData) {
      const leftEntity = getEntityRevision(
        subgraph,
        entity.linkData.leftEntityId,
      );

      if (!leftEntity) {
        throw new Error("Left entity of link entity not found in subgraph.");
      }

      const rightEntity = getEntityRevision(
        subgraph,
        entity.linkData.rightEntityId,
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
  }, [entity, subgraph]);

  const hasLeftOrRightDraftEntity = !!draftLeftEntity || !!draftRightEntity;

  const handleAccept = useCallback(async () => {
    if (hasLeftOrRightDraftEntity) {
      setShowDraftLinkEntityWithDraftLeftOrRightEntityWarning(true);
    } else {
      await updateEntity({
        variables: {
          entityId: entity.metadata.recordId.entityId,
          updatedProperties: entity.properties,
          draft: false,
        },
      });

      await refetchDraftEntities();
    }
  }, [hasLeftOrRightDraftEntity, updateEntity, entity, refetchDraftEntities]);

  const handleAcceptDraftLinkEntityWithDraftLeftOrRightEntities =
    useCallback(async () => {
      await Promise.all(
        [draftLeftEntity ?? [], draftRightEntity ?? []]
          .flat()
          .map((draftEntity) =>
            updateEntity({
              variables: {
                entityId: draftEntity.metadata.recordId.entityId,
                updatedProperties: draftEntity.properties,
                draft: false,
              },
            }),
          ),
      );

      await updateEntity({
        variables: {
          entityId: entity.metadata.recordId.entityId,
          updatedProperties: entity.properties,
          draft: false,
        },
      });

      await refetchDraftEntities();
    }, [
      draftLeftEntity,
      entity,
      draftRightEntity,
      updateEntity,
      refetchDraftEntities,
    ]);

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
            linkEntity={entity as LinkEntity}
            subgraph={subgraph}
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
      <Box marginLeft={1} display="flex" columnGap={1}>
        <Button
          onClick={handleIgnore}
          size="xs"
          variant="tertiary"
          startIcon={<CloseIcon />}
          sx={{
            background: ({ palette }) => palette.gray[20],
            borderColor: ({ palette }) => palette.gray[30],
            color: ({ palette }) => palette.common.black,
            [`> .${buttonClasses.startIcon} > svg`]: {
              fill: ({ palette }) => palette.common.black,
            },
            "&:hover": {
              background: ({ palette }) => palette.gray[30],
            },
          }}
        >
          Ignore
        </Button>
        <Button
          onClick={handleAccept}
          size="xs"
          variant="primary"
          startIcon={<CheckRegularIcon />}
        >
          Accept
        </Button>
      </Box>
    </>
  );
};
