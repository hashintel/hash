import { useMutation } from "@apollo/client";
import { CaretDownSolidIcon } from "@hashintel/design-system";
import { EntityId } from "@local/hash-subgraph";
import { Box, buttonClasses, ListItemText, Menu } from "@mui/material";
import {
  anchorRef,
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useCallback, useMemo } from "react";

import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import {
  archiveEntityMutation,
  updateEntityMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../../shared/draft-entities-context";
import { LayerGroupLightIcon } from "../../shared/icons/layer-group-light-icon";
import { useNotificationEntities } from "../../shared/notification-entities-context";
import { Button, MenuItem } from "../../shared/ui";
import { useNotificationsWithLinks } from "../shared/notifications-with-links-context";

export const DraftEntitiesBulkActionsDropdown: FunctionComponent<{
  selectedDraftEntityIds: EntityId[];
  deselectAllDraftEntities: () => void;
}> = ({ selectedDraftEntityIds, deselectAllDraftEntities }) => {
  const { draftEntities, refetch: refetchDraftEntities } = useDraftEntities();
  const { notifications } = useNotificationsWithLinks();
  const { archiveNotification, markNotificationAsRead } =
    useNotificationEntities();

  const popupState = usePopupState({
    variant: "popover",
    popupId: "draft-entities-bulk-actions-dropdown-menu",
  });

  const isDisabled = selectedDraftEntityIds.length === 0;

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

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const ignoreAllSelectedDraftEntities = useCallback(async () => {
    if (!notifications) {
      return;
    }

    const relatedNotifications = notifications.filter((notification) =>
      selectedDraftEntityIds.includes(
        notification.occurredInEntity.metadata.recordId.entityId,
      ),
    );

    await Promise.all([
      ...relatedNotifications.map((notification) =>
        archiveNotification({
          notificationEntity: notification.entity,
        }),
      ),
      ...selectedDraftEntities.map((selectedDraftEntity) =>
        archiveEntity({
          variables: {
            entityId: selectedDraftEntity.metadata.recordId.entityId,
          },
        }),
      ),
    ]);

    await refetchDraftEntities();
  }, [
    notifications,
    archiveNotification,
    archiveEntity,
    selectedDraftEntityIds,
    selectedDraftEntities,
    refetchDraftEntities,
  ]);

  const handleIgnoreAll = useCallback(async () => {
    await ignoreAllSelectedDraftEntities();

    deselectAllDraftEntities();

    popupState.close();
  }, [ignoreAllSelectedDraftEntities, deselectAllDraftEntities, popupState]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const acceptAllSelectedDraftEntities = useCallback(async () => {
    const relatedGraphChangeNotifications =
      notifications?.filter(
        ({ kind, occurredInEntity }) =>
          kind === "graph-change" &&
          selectedDraftEntityIds.includes(
            occurredInEntity.metadata.recordId.entityId,
          ),
      ) ?? [];

    await Promise.all([
      ...relatedGraphChangeNotifications.map((notification) =>
        markNotificationAsRead({ notificationEntity: notification.entity }),
      ),
      ...selectedDraftEntities.map((draftEntity) =>
        updateEntity({
          variables: {
            entityId: draftEntity.metadata.recordId.entityId,
            updatedProperties: draftEntity.properties,
            draft: false,
          },
        }),
      ),
    ]);

    await refetchDraftEntities();
  }, [
    notifications,
    markNotificationAsRead,
    selectedDraftEntityIds,
    selectedDraftEntities,
    updateEntity,
    refetchDraftEntities,
  ]);

  const handleAcceptAll = useCallback(async () => {
    await acceptAllSelectedDraftEntities();

    deselectAllDraftEntities();

    popupState.close();
  }, [acceptAllSelectedDraftEntities, deselectAllDraftEntities, popupState]);

  return (
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
          fontWeight: 600,
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
        disabled={isDisabled}
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
  );
};
