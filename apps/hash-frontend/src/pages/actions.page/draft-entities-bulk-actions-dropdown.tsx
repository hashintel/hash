import { useMutation } from "@apollo/client";
import { AlertModal, CaretDownSolidIcon } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
} from "@local/hash-subgraph/stdlib";
import { Box, buttonClasses, Fade, ListItemText, Menu } from "@mui/material";
import {
  anchorRef,
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import type {
  ArchiveEntitiesMutation,
  ArchiveEntitiesMutationVariables,
  UpdateEntitiesMutation,
  UpdateEntitiesMutationVariables,
} from "../../graphql/api-types.gen";
import {
  archiveEntitiesMutation,
  updateEntitiesMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../../shared/draft-entities-context";
import { LayerGroupLightIcon } from "../../shared/icons/layer-group-light-icon";
import { useNotificationEntities } from "../../shared/notification-entities-context";
import { Button, MenuItem } from "../../shared/ui";
import { useNotificationsWithLinks } from "../shared/notifications-with-links-context";

export const DraftEntitiesBulkActionsDropdown: FunctionComponent<{
  selectedDraftEntityIds: EntityId[];
  draftEntitiesWithLinkedDataSubgraph?: Subgraph<EntityRootType>;
  deselectAllDraftEntities: () => void;
}> = ({
  selectedDraftEntityIds,
  draftEntitiesWithLinkedDataSubgraph,
  deselectAllDraftEntities,
}) => {
  const { draftEntities, refetch: refetchDraftEntities } = useDraftEntities();
  const { notifications } = useNotificationsWithLinks();
  const { archiveNotifications, markNotificationsAsRead } =
    useNotificationEntities();

  const popupState = usePopupState({
    variant: "popover",
    popupId: "draft-entities-bulk-actions-dropdown-menu",
  });

  const isMoreThanOneDraftSelected = selectedDraftEntityIds.length > 0;

  const selectedDraftEntities = useMemo(
    () =>
      draftEntities
        ? draftEntities.filter((draftEntity) =>
            selectedDraftEntityIds.includes(
              draftEntity.metadata.recordId.entityId,
            ),
          )
        : [],
    [draftEntities, selectedDraftEntityIds],
  );

  const incomingOrOutgoingDraftLinksToIgnore = useMemo(() => {
    if (!draftEntitiesWithLinkedDataSubgraph) {
      return;
    }

    return selectedDraftEntities
      .map((selectedDraftEntity) => {
        if (selectedDraftEntity.linkData) {
          return [];
        }

        return [
          ...getIncomingLinksForEntity(
            draftEntitiesWithLinkedDataSubgraph,
            selectedDraftEntity.metadata.recordId.entityId,
          ).filter(
            (linkEntity) =>
              !!extractDraftIdFromEntityId(
                linkEntity.metadata.recordId.entityId,
              ),
          ),
          ...getOutgoingLinksForEntity(
            draftEntitiesWithLinkedDataSubgraph,
            selectedDraftEntity.metadata.recordId.entityId,
          ).filter(
            (linkEntity) =>
              !!extractDraftIdFromEntityId(
                linkEntity.metadata.recordId.entityId,
              ),
          ),
        ];
      })
      .flat();
  }, [draftEntitiesWithLinkedDataSubgraph, selectedDraftEntities]);

  const [archiveEntities] = useMutation<
    ArchiveEntitiesMutation,
    ArchiveEntitiesMutationVariables
  >(archiveEntitiesMutation);

  const ignoreAllSelectedDraftEntities = useCallback(async () => {
    if (!notifications) {
      return;
    }

    const relatedNotifications = notifications.filter((notification) =>
      selectedDraftEntityIds.includes(
        notification.occurredInEntity.metadata.recordId.entityId,
      ),
    );

    await archiveEntities({
      variables: {
        entityIds: [
          ...selectedDraftEntities,
          ...(incomingOrOutgoingDraftLinksToIgnore ?? []),
        ].map(({ metadata }) => metadata.recordId.entityId),
      },
    });

    await archiveNotifications({
      notificationEntities: relatedNotifications.map(({ entity }) => entity),
    });

    await refetchDraftEntities();

    deselectAllDraftEntities();
  }, [
    notifications,
    archiveNotifications,
    archiveEntities,
    selectedDraftEntityIds,
    selectedDraftEntities,
    refetchDraftEntities,
    incomingOrOutgoingDraftLinksToIgnore,
    deselectAllDraftEntities,
  ]);

  const [
    showDraftEntitiesWithDraftLinksWarning,
    setShowDraftEntitiesWithDraftLinksWarning,
  ] = useState<boolean>(false);

  const handleIgnoreDraftLinkEntitiesWithDraftLinks = useCallback(async () => {
    await ignoreAllSelectedDraftEntities();

    setShowDraftEntitiesWithDraftLinksWarning(false);
  }, [ignoreAllSelectedDraftEntities]);

  const handleIgnoreAll = useCallback(async () => {
    if (!incomingOrOutgoingDraftLinksToIgnore) {
      return;
    }

    if (incomingOrOutgoingDraftLinksToIgnore.length > 0) {
      setShowDraftEntitiesWithDraftLinksWarning(true);
    } else {
      await ignoreAllSelectedDraftEntities();
    }

    popupState.close();
  }, [
    ignoreAllSelectedDraftEntities,
    popupState,
    incomingOrOutgoingDraftLinksToIgnore,
  ]);

  const leftOrRightDraftEntitiesToAccept = useMemo(() => {
    if (!draftEntitiesWithLinkedDataSubgraph) {
      return;
    }

    return selectedDraftEntities
      .map((selectedDraftEntity) => {
        if (!selectedDraftEntity.linkData) {
          return [];
        }

        const leftEntity = getEntityRevision(
          draftEntitiesWithLinkedDataSubgraph,
          selectedDraftEntity.linkData.leftEntityId,
        );

        const rightEntity = getEntityRevision(
          draftEntitiesWithLinkedDataSubgraph,
          selectedDraftEntity.linkData.rightEntityId,
        );

        return [
          /**
           * Note: if a left or right draft entity has already been archived, it
           * may not be present in the subgraph. This is why the `leftEntity` and
           * `rightEntity` are nullable in this context.
           */
          leftEntity &&
          extractDraftIdFromEntityId(leftEntity.metadata.recordId.entityId) !==
            undefined
            ? leftEntity
            : [],
          rightEntity &&
          extractDraftIdFromEntityId(rightEntity.metadata.recordId.entityId) !==
            undefined
            ? rightEntity
            : [],
        ].flat();
      })
      .flat();
  }, [draftEntitiesWithLinkedDataSubgraph, selectedDraftEntities]);

  const [updateEntities] = useMutation<
    UpdateEntitiesMutation,
    UpdateEntitiesMutationVariables
  >(updateEntitiesMutation);

  const acceptAllSelectedDraftEntities = useCallback(async () => {
    const relatedGraphChangeNotifications =
      notifications?.filter(
        ({ kind, occurredInEntity }) =>
          kind === "graph-change" &&
          selectedDraftEntityIds.includes(
            occurredInEntity.metadata.recordId.entityId,
          ),
      ) ?? [];

    await updateEntities({
      variables: {
        entityUpdates: [
          ...selectedDraftEntities,
          ...(leftOrRightDraftEntitiesToAccept ?? []),
        ].map((draftEntity) => ({
          entityId: draftEntity.metadata.recordId.entityId,
          propertyPatches: [],
          draft: false,
        })),
      },
    });

    await markNotificationsAsRead({
      notificationEntities: relatedGraphChangeNotifications.map(
        ({ entity }) => entity,
      ),
    });

    await refetchDraftEntities();

    deselectAllDraftEntities();
  }, [
    notifications,
    markNotificationsAsRead,
    selectedDraftEntityIds,
    selectedDraftEntities,
    leftOrRightDraftEntitiesToAccept,
    updateEntities,
    refetchDraftEntities,
    deselectAllDraftEntities,
  ]);

  const [
    showDraftLinkEntitiesWithDraftLeftOrRightEntityWarning,
    setShowDraftLinkEntitiesWithDraftLeftOrRightEntityWarning,
  ] = useState<boolean>(false);

  const handleAcceptDraftLinkEntitiesWithDraftLeftOrRightEntities =
    useCallback(async () => {
      await acceptAllSelectedDraftEntities();

      setShowDraftLinkEntitiesWithDraftLeftOrRightEntityWarning(false);
    }, [acceptAllSelectedDraftEntities]);

  const handleAcceptAll = useCallback(async () => {
    if (!leftOrRightDraftEntitiesToAccept) {
      return;
    }

    if (leftOrRightDraftEntitiesToAccept.length > 0) {
      setShowDraftLinkEntitiesWithDraftLeftOrRightEntityWarning(true);
    } else {
      await acceptAllSelectedDraftEntities();
    }

    popupState.close();
  }, [
    leftOrRightDraftEntitiesToAccept,
    acceptAllSelectedDraftEntities,
    popupState,
  ]);

  return (
    <>
      {showDraftEntitiesWithDraftLinksWarning &&
        incomingOrOutgoingDraftLinksToIgnore && (
          <AlertModal
            callback={handleIgnoreDraftLinkEntitiesWithDraftLinks}
            calloutMessage={
              <>
                {incomingOrOutgoingDraftLinksToIgnore.length} additional draft
                link{incomingOrOutgoingDraftLinksToIgnore.length > 1 ? "s" : ""}{" "}
                will be ignored because you are ignoring draft entities which
                they depend on.
              </>
            }
            close={() => setShowDraftEntitiesWithDraftLinksWarning(false)}
            header="Ignore additional drafts"
            type="info"
          />
        )}
      {showDraftLinkEntitiesWithDraftLeftOrRightEntityWarning &&
        leftOrRightDraftEntitiesToAccept && (
          <AlertModal
            callback={handleAcceptDraftLinkEntitiesWithDraftLeftOrRightEntities}
            calloutMessage={
              <>
                {leftOrRightDraftEntitiesToAccept.length} additional draft{" "}
                {leftOrRightDraftEntitiesToAccept.length > 1
                  ? "entities"
                  : "entity"}{" "}
                will be accepted because you are accepting links which depend on
                them.
              </>
            }
            close={() =>
              setShowDraftLinkEntitiesWithDraftLeftOrRightEntityWarning(false)
            }
            header="Accept additional drafts"
            type="info"
          />
        )}
      <Fade in={isMoreThanOneDraftSelected}>
        <Box
          display="flex"
          columnGap={1}
          alignItems="flex-end"
          ref={anchorRef(popupState)}
        >
          <LayerGroupLightIcon
            sx={{ fontSize: 16, color: ({ palette }) => palette.gray[50] }}
          />
          <Button
            variant="tertiary_quiet"
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: ({ palette }) => palette.gray[90],
              [`.${buttonClasses.endIcon}`]: {
                color: ({ palette }) => palette.gray[90],
              },
              padding: 0,
              minWidth: "unset",
              minHeight: "unset",
              border: "none",
              lineHeight: 0,
              background: "transparent",
              "&:hover": {
                background: "transparent",
                border: "none",
                color: ({ palette }) => palette.gray[90],
              },
              [`&.${buttonClasses.disabled}`]: {
                background: "transparent",
                color: ({ palette }) => palette.gray[70],
                [`.${buttonClasses.endIcon}`]: {
                  color: ({ palette }) => palette.gray[70],
                },
              },
            }}
            endIcon={<CaretDownSolidIcon />}
            disabled={!isMoreThanOneDraftSelected}
            {...bindTrigger(popupState)}
          >
            Bulk Action
          </Button>
          <Menu
            {...bindMenu(popupState)}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "left",
            }}
            slotProps={{
              paper: {
                elevation: 4,
                sx: ({ palette }) => ({
                  borderRadius: "6px",
                  marginTop: 1,
                  border: `1px solid ${palette.gray["20"]}`,
                }),
              },
            }}
          >
            <MenuItem onClick={handleIgnoreAll}>
              <ListItemText
                primary={`Ignore ${selectedDraftEntityIds.length} draft${
                  selectedDraftEntityIds.length > 1 ? "s" : ""
                }`}
              />
            </MenuItem>
            <MenuItem onClick={handleAcceptAll}>
              <ListItemText
                primary={`Accept ${selectedDraftEntityIds.length} draft${
                  selectedDraftEntityIds.length > 1 ? "s" : ""
                }`}
              />
            </MenuItem>
          </Menu>
        </Box>
      </Fade>
    </>
  );
};
