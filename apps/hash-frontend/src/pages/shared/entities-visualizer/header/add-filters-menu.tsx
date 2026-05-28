import { Box, chipClasses, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { CaretDownSolidIcon, Chip } from "@hashintel/design-system";

import { PlusRegularIcon } from "../../../../shared/icons/plus-regular";
import { MenuItem } from "../../../../shared/ui";

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
        label={
          <Box
            component="span"
            display="inline-flex"
            alignItems="center"
            gap={0.6}
          >
            Add filters
            <CaretDownSolidIcon
              sx={{
                fontSize: 12,
                transform: `rotate(${popupState.isOpen ? 180 : 0}deg)`,
              }}
            />
          </Box>
        }
        sx={{
          height: 24,
          border: ({ palette }) => `1px dashed ${palette.gray[30]}`,
          background: ({ palette }) => palette.gray[5],
          cursor: "pointer",
          [`.${chipClasses.label}`]: {
            color: ({ palette }) => palette.gray[70],
            fontSize: 13,
            fontWeight: 500,
          },
        }}
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
