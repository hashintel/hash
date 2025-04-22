import { useMutation } from "@apollo/client";
import {
  type DataTypeWithMetadata,
  type EntityTypeWithMetadata,
  extractWebIdFromEntityId,
  type PropertyTypeWithMetadata,
  type WebId,
} from "@blockprotocol/type-system";
import { CaretDownSolidIcon, Chip } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { isEntity } from "@local/hash-isomorphic-utils/entity-store";
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
import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";

import { useArchivePage } from "../../components/hooks/use-archive-page";
import type {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  ArchiveEntityTypeMutation,
  ArchiveEntityTypeMutationVariables,
  ArchivePropertyTypeMutation,
  ArchivePropertyTypeMutationVariables,
  UnarchiveEntityTypeMutation,
  UnarchiveEntityTypeMutationVariables,
  UnarchivePropertyTypeMutation,
  UnarchivePropertyTypeMutationVariables,
} from "../../graphql/api-types.gen";
import { archiveEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
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
  isTypeDataType,
  isTypeEntityType,
  isTypePropertyType,
} from "../is-of-type";
import { useRefetchPropertyTypes } from "../property-types-context";
import { MenuItem } from "../ui";

export const BulkActionsDropdown: FunctionComponent<{
  selectedItems: (
    | HashEntity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  onBulkActionCompleted?: () => void;
}> = ({ selectedItems, onBulkActionCompleted }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { archivePage, unarchivePage } = useArchivePage();

  const refetchEntityTypes = useFetchEntityTypes();

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

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
        const itemWebId = isType(item)
          ? (item.metadata.provenance.edition.createdById as WebId)
          : extractWebIdFromEntityId(item.metadata.recordId.entityId);

        // The item has to be owned by the user or an org the user is a member of
        if (
          ![
            authenticatedUser.accountId,
            ...authenticatedUser.memberOf.map(({ org }) => org.webId),
          ].includes(itemWebId)
        ) {
          /**
           * @todo: use proper permission checking for entities
           */
          return false;
        }

        if (isEntity(item)) {
          return true;
        }

        /**
         * @todo: support archiving data types when we have custom data types
         */
        return !isTypeDataType(item);
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
          await archiveEntity({
            variables: { entityId: item.metadata.recordId.entityId },
          });
        }
      }),
    );
  }, [
    selectedItems,
    archiveEntity,
    archiveEntityType,
    archivePage,
    archivePropertyType,
  ]);

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
                  onBulkActionCompleted?.();
                  popupState.close();
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
