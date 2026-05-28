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
  includeArchived: boolean;
  onAddIncludeArchived: () => void;
};

export const AddFiltersMenu: FunctionComponent<AddFiltersMenuProps> = ({
  includeArchived,
  onAddIncludeArchived,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-add-filters-menu",
  });

  const handleSelectIncludeArchived = () => {
    onAddIncludeArchived();
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
        <MenuItem
          onClick={handleSelectIncludeArchived}
          disabled={includeArchived}
          sx={{ minWidth: 200 }}
        >
          <ListItemText primary="Include archived" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
