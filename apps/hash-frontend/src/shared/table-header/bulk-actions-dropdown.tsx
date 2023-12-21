import { useMutation } from "@apollo/client";
import { CaretDownSolidIcon, Chip } from "@hashintel/design-system";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  extractOwnedByIdFromEntityId,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import {
  Box,
  chipClasses,
  ListItemIcon,
  ListItemText,
  Menu,
  Tooltip,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useArchivePage } from "../../components/hooks/use-archive-page";
import {
  ArchiveEntityTypeMutation,
  ArchiveEntityTypeMutationVariables,
  ArchivePropertyTypeMutation,
  ArchivePropertyTypeMutationVariables,
  UnarchiveEntityTypeMutation,
  UnarchiveEntityTypeMutationVariables,
  UnarchivePropertyTypeMutation,
  UnarchivePropertyTypeMutationVariables,
} from "../../graphql/api-types.gen";
import {
  archiveEntityTypeMutation,
  unarchiveEntityTypeMutation,
} from "../../graphql/queries/ontology/entity-type.queries";
import {
  archivePropertyTypeMutation,
  unarchivePropertyTypeMutation,
} from "../../graphql/queries/ontology/property-type.queries";
import { useAuthenticatedUser } from "../../pages/shared/auth-info-context";
import { useFetchEntityTypes } from "../entity-types-context/hooks";
import { BoxArchiveIcon } from "../icons/box-archive-icon";
import { isItemArchived } from "../is-archived";
import {
  isEntityPageEntity,
  isType,
  isTypeEntityType,
  isTypePropertyType,
} from "../is-of-type";
import { useRefetchPropertyTypes } from "../property-types-context";
import { MenuItem } from "../ui";

export const BulkActionsDropdown: FunctionComponent<{
  selectedItems: (
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  onBulkActionCompleted?: () => void;
}> = ({ selectedItems, onBulkActionCompleted }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { archivePage, unarchivePage } = useArchivePage();

  const refetchEntityTypes = useFetchEntityTypes();

  const [archiveEntityType] = useMutation<
    ArchiveEntityTypeMutation,
    ArchiveEntityTypeMutationVariables
  >(archiveEntityTypeMutation, {
    onCompleted: refetchEntityTypes,
  });

  const [unarchiveEntityType] = useMutation<
    UnarchiveEntityTypeMutation,
    UnarchiveEntityTypeMutationVariables
  >(unarchiveEntityTypeMutation, {
    onCompleted: refetchEntityTypes,
  });

  const refetchPropertyTypes = useRefetchPropertyTypes();

  const [archivePropertyType] = useMutation<
    ArchivePropertyTypeMutation,
    ArchivePropertyTypeMutationVariables
  >(archivePropertyTypeMutation, {
    onCompleted: refetchPropertyTypes,
  });

  const [unarchivePropertyType] = useMutation<
    UnarchivePropertyTypeMutation,
    UnarchivePropertyTypeMutationVariables
  >(unarchivePropertyTypeMutation, {
    onCompleted: refetchPropertyTypes,
  });

  const popupState = usePopupState({
    variant: "popover",
    popupId: "table-header-bulk-actions-dropdown-menu",
  });

  // Whether or not the selected items can be archived or un-archived
  const itemsAreArchiveable = useMemo(
    () =>
      selectedItems.filter((item) => {
        const itemOwnedById = isType(item)
          ? item.metadata.provenance.edition.createdById
          : extractOwnedByIdFromEntityId(item.metadata.recordId.entityId);

        // The item has to be owned by the user or an org the user is a member of
        if (
          ![
            authenticatedUser.accountId,
            ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
          ].includes(itemOwnedById)
        ) {
          return false;
        }

        /**
         * @todo: check whether the user has permission to archive the type
         */

        if (isType(item)) {
          if (isTypeEntityType(item)) {
            // Entity types can be archived
            return true;
          }
          if (isTypePropertyType(item)) {
            // Property types can be archived
            return true;
          }
          /**
           * @todo: support archiving data types when we have custom data types
           */
        } else if (isEntityPageEntity(item)) {
          // Page entities can be archived
          return true;
        }
        /** @todo: support archiving entities, including checking permissions */
        // Everything else cannot be archived
        return false;
      }).length === selectedItems.length,
    [selectedItems, authenticatedUser],
  );

  // Whether or not the selected items can be archived
  const canArchiveSelectedItems = useMemo(
    () =>
      itemsAreArchiveable &&
      selectedItems.filter((item) => !isItemArchived(item)).length ===
        selectedItems.length,
    [selectedItems, itemsAreArchiveable],
  );

  const archiveItem = useCallback(async () => {
    await Promise.all(
      selectedItems.map(async (item) => {
        if (isType(item)) {
          if (isTypeEntityType(item)) {
            await archiveEntityType({
              variables: {
                entityTypeId: item.schema.$id,
              },
            });
          } else if (isTypePropertyType(item)) {
            await archivePropertyType({
              variables: {
                propertyTypeId: item.schema.$id,
              },
            });
          } else {
            throw new Error("Archiving data types is not yet supported.");
          }
        } else if (isEntityPageEntity(item)) {
          await archivePage(item.metadata.recordId.entityId);
        } else {
          throw new Error("Archiving entities is not yet supported.");
        }
      }),
    );
  }, [selectedItems, archiveEntityType, archivePage, archivePropertyType]);

  // Whether or not the selected items can be un-archived
  const canUnarchiveSelectedItems = useMemo(
    () =>
      itemsAreArchiveable &&
      selectedItems.filter((item) => isItemArchived(item)).length ===
        selectedItems.length,
    [selectedItems, itemsAreArchiveable],
  );

  const unarchiveItem = useCallback(async () => {
    await Promise.all(
      selectedItems.map(async (item) => {
        if (isType(item)) {
          if (isTypeEntityType(item)) {
            await unarchiveEntityType({
              variables: {
                entityTypeId: item.schema.$id,
              },
            });
          } else if (isTypePropertyType(item)) {
            await unarchivePropertyType({
              variables: {
                propertyTypeId: item.schema.$id,
              },
            });
          } else {
            throw new Error("Archiving data types is not yet supported.");
          }
        } else if (isEntityPageEntity(item)) {
          await unarchivePage(item.metadata.recordId.entityId);
        } else {
          throw new Error("Archiving entities is not yet supported.");
        }
      }),
    );
  }, [
    selectedItems,
    unarchiveEntityType,
    unarchivePage,
    unarchivePropertyType,
  ]);

  const menuItems = useMemo(() => {
    return [
      {
        icon: <BoxArchiveIcon />,
        label: "Archive",
        onClick: archiveItem,
        disabled: !canArchiveSelectedItems,
        tooltipTitle: canArchiveSelectedItems
          ? undefined
          : "Cannot archive one or more of the selected items.",
      },
      {
        icon: <BoxArchiveIcon />,
        label: "Unarchive",
        onClick: unarchiveItem,
        disabled: !canUnarchiveSelectedItems,
        tooltipTitle: canUnarchiveSelectedItems
          ? undefined
          : "Cannot unarchive one or more of the selected items.",
      },
    ];
  }, [
    canArchiveSelectedItems,
    archiveItem,
    unarchiveItem,
    canUnarchiveSelectedItems,
  ]);

  return (
    <Box>
      <Chip
        label={
          <>
            {selectedItems.length} selected{" "}
            <CaretDownSolidIcon
              sx={{
                fontSize: 12,
                transform: `rotate(${popupState.isOpen ? 180 : 0}deg)`,
              }}
            />
          </>
        }
        sx={{
          [`.${chipClasses.label}`]: {
            fontSize: 13,
          },
          border: ({ palette }) => palette.common.white,
          background: ({ palette }) => palette.gray[5],
        }}
        {...bindTrigger(popupState)}
      />

      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: 30,
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        {menuItems.map(({ label, onClick, icon, disabled, tooltipTitle }) => (
          <Tooltip key={label} title={tooltipTitle}>
            {/**
             * We need this wrapper to display the tooltip on disabled menu items
             * @see https://mui.com/material-ui/react-tooltip/#disabled-elements
             */}
            <Box>
              <MenuItem
                onClick={async () => {
                  await onClick();
                  popupState.close();
                  onBulkActionCompleted?.();
                }}
                disabled={disabled}
              >
                <ListItemIcon>{icon}</ListItemIcon>
                <ListItemText primary={label} />
              </MenuItem>
            </Box>
          </Tooltip>
        ))}
      </Menu>
    </Box>
  );
};
