import { useMutation } from "@apollo/client";
import { CaretDownIcon } from "@hashintel/block-design-system";
import { Chip } from "@hashintel/design-system";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import {
  Box,
  chipClasses,
  ListItemIcon,
  ListItemText,
  Menu,
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
} from "../../graphql/api-types.gen";
import { archiveEntityTypeMutation } from "../../graphql/queries/ontology/entity-type.queries";
import { archivePropertyTypeMutation } from "../../graphql/queries/ontology/property-type.queries";
import { BoxArchiveIcon } from "../icons/box-archive-icon";
import { MenuItem } from "../ui";
import {
  isEntityPageEntity,
  isItemArchived,
  isType,
  isTypeEntityType,
  isTypePropertyType,
} from "../util";

export const BulkActionsDropdown: FunctionComponent<{
  selectedItems: (
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
}> = ({ selectedItems }) => {
  const { archivePage } = useArchivePage();

  const [archiveEntityType] = useMutation<
    ArchiveEntityTypeMutation,
    ArchiveEntityTypeMutationVariables
  >(archiveEntityTypeMutation);

  const [archivePropertyType] = useMutation<
    ArchivePropertyTypeMutation,
    ArchivePropertyTypeMutationVariables
  >(archivePropertyTypeMutation);

  const popupState = usePopupState({
    variant: "popover",
    popupId: "table-header-bulk-actions-dropdown-menu",
  });

  const canArchiveSelectedItems = useMemo(
    () =>
      selectedItems.filter((item) => {
        if (isItemArchived(item)) {
          return false;
        }
        /**
         * @todo: also check whether the user has permission to archive the item
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
        /** @todo: support archiving entities */
        // Everything else cannot be archived
        return false;
      }).length === selectedItems.length,
    [selectedItems],
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

  const menuItems = useMemo(() => {
    return [
      {
        icon: <BoxArchiveIcon />,
        label: "Archive",
        onClick: archiveItem,
        disabled: !canArchiveSelectedItems,
      },
    ];
  }, [canArchiveSelectedItems, archiveItem]);

  return (
    <Box>
      <Chip
        label={
          <>
            {selectedItems.length} selected{" "}
            <CaretDownIcon
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
        {menuItems.map(({ label, onClick, icon, disabled }) => (
          <MenuItem
            key={label}
            onClick={async () => {
              await onClick();
              popupState.close();
            }}
            disabled={disabled}
          >
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};
