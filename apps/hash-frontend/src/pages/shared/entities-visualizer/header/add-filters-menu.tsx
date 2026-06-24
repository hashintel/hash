import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useState } from "react";

import { Chip } from "@hashintel/design-system";

import { PlusRegularIcon } from "../../../../shared/icons/plus-regular";
import { MenuItem } from "../../../../shared/ui";
import { dashedPillSx } from "./pill-styles";
import { PropertyFilterPicker } from "./property-filter-picker";

import type {
  FilterableProperty,
  FilterMetadataForProperty,
} from "../shared/property-filters/property-filter";
import type { FunctionComponent } from "react";

type AddFiltersMenuProps = {
  canAddIncludeArchived: boolean;
  onAddIncludeArchived: () => void;
  filterableProperties: FilterMetadataForProperty[];
  propertiesLoading: boolean;
  onAddPropertyFilter: (
    property: Pick<FilterableProperty, "baseUrl" | "title" | "kind">,
  ) => void;
};

export const AddFiltersMenu: FunctionComponent<AddFiltersMenuProps> = ({
  canAddIncludeArchived,
  onAddIncludeArchived,
  filterableProperties,
  propertiesLoading,
  onAddPropertyFilter,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-add-filters-menu",
  });

  const [mode, setMode] = useState<"root" | "property">("root");

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
        slotProps={{
          paper: {
            sx: {
              maxHeight: 420,
              width: mode === "property" ? 320 : undefined,
            },
          },
        }}
        TransitionProps={{
          // Reset to the root menu whenever it closes so reopening starts fresh.
          onExited: () => setMode("root"),
        }}
      >
        {mode === "root"
          ? [
              canAddIncludeArchived ? (
                <MenuItem
                  key="include-archived"
                  onClick={handleSelectIncludeArchived}
                  sx={{ minWidth: 200 }}
                >
                  <ListItemText primary="Include archived" />
                </MenuItem>
              ) : null,
              <MenuItem
                key="property"
                onClick={() => setMode("property")}
                sx={{ minWidth: 200 }}
              >
                <ListItemText primary="Property…" />
              </MenuItem>,
            ]
          : [
              // Wrapped in a Box (which forwards a ref) so MUI's Menu can manage
              // focus without warning about reffing a function component.
              <Box key="property-picker">
                <PropertyFilterPicker
                  properties={filterableProperties}
                  loading={propertiesLoading}
                  onBack={() => setMode("root")}
                  onSelect={(property) => {
                    onAddPropertyFilter(property);
                    popupState.close();
                  }}
                />
              </Box>,
            ]}
      </Menu>
    </Box>
  );
};
