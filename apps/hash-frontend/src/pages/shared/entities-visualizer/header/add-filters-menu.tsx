import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { Chip } from "@hashintel/design-system";

import { PlusRegularIcon } from "../../../../shared/icons/plus-regular";
import { MenuItem } from "../../../../shared/ui";
import { dashedPillSx } from "./pill-styles";

import type { FunctionComponent } from "react";

type AddFiltersMenuProps = {
  onAddIncludeArchived: () => void;
  /** When set, adds a "Semantic search" filter option to the menu. */
  onAddSemanticSearch?: () => void;
};

export const AddFiltersMenu: FunctionComponent<AddFiltersMenuProps> = ({
  onAddIncludeArchived,
  onAddSemanticSearch,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-add-filters-menu",
  });

  const handleSelectIncludeArchived = () => {
    onAddIncludeArchived();
    popupState.close();
  };

  const handleSelectSemanticSearch = () => {
    onAddSemanticSearch?.();
    popupState.close();
  };

  return (
    <Box>
      <Chip
        icon={
          <PlusRegularIcon
            sx={{ fill: ({ palette }) => palette.primary.main }}
          />
        }
        label="Add filter"
        sx={dashedPillSx}
        {...bindTrigger(popupState)}
      />
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{ vertical: 30, horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <MenuItem onClick={handleSelectIncludeArchived} sx={{ minWidth: 200 }}>
          <ListItemText primary="Include archived" />
        </MenuItem>
        {onAddSemanticSearch && (
          <MenuItem onClick={handleSelectSemanticSearch} sx={{ minWidth: 200 }}>
            <ListItemText primary="Semantic search" />
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};
