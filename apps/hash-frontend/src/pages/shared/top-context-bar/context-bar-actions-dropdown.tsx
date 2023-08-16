import { useMutation } from "@apollo/client";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph/.";
import { ListItemIcon, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useCallback } from "react";

import { useArchivePage } from "../../../components/hooks/use-archive-page";
import {
  ArchiveEntityTypeMutation,
  ArchiveEntityTypeMutationVariables,
} from "../../../graphql/api-types.gen";
import { archiveEntityTypeMutation } from "../../../graphql/queries/ontology/entity-type.queries";
import { useFetchEntityTypes } from "../../../shared/entity-types-context/hooks";
import { BoxArchiveIcon } from "../../../shared/icons/box-archive-icon";
import { MenuItem } from "../../../shared/ui";
import { isEntityPageEntity, isItemEntityType } from "./util";

export const ContextBarActionsDropdown: FunctionComponent<{
  item: Entity | EntityTypeWithMetadata;
}> = ({ item }) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "context-bar-actions-dropdown-menu",
  });

  const refetchEntityTypes = useFetchEntityTypes();

  const { archivePage } = useArchivePage();

  const [archiveEntityType] = useMutation<
    ArchiveEntityTypeMutation,
    ArchiveEntityTypeMutationVariables
  >(archiveEntityTypeMutation);

  const handleArchive = useCallback(async () => {
    if (isItemEntityType(item)) {
      await archiveEntityType({
        variables: {
          entityTypeId: item.schema.$id,
        },
      });
      await refetchEntityTypes();
    } else if (isEntityPageEntity(item)) {
      await archivePage(item.metadata.recordId.entityId);
    } else {
      throw new Error("Archiving entities is not yet supported.");
    }
    popupState.close();
  }, [item, archiveEntityType, archivePage, refetchEntityTypes, popupState]);

  return (
    <>
      <IconButton {...bindTrigger(popupState)}>
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </IconButton>
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            borderRadius: "6px",
            marginTop: 1,
            border: ({ palette }) => `1px solid ${palette.gray["20"]}`,

            // [`.${listItemSecondaryActionClasses.root}`]: {
            //   display: { xs: "none", md: "block" },
            // },
          },
        }}
      >
        <MenuItem onClick={handleArchive}>
          <ListItemIcon>
            <BoxArchiveIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primary={`Archive ${
              isItemEntityType(item)
                ? "type"
                : isEntityPageEntity(item)
                ? "page"
                : "entity"
            }`}
          />
        </MenuItem>
      </Menu>
    </>
  );
};
