import { Box, ListItemText, Menu, Tooltip } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { CaretDownSolidIcon } from "@hashintel/design-system";

import { ArrowDownAZRegularIcon } from "../../../../shared/icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../../shared/icons/arrow-up-a-z-regular-icon";
import { TableHeaderButton } from "../../../../shared/table-header/table-header-button";
import { MenuItem } from "../../../../shared/ui";

import type { GridSort } from "../../../../components/grid/grid";
import type { SortableEntitiesTableColumnKey } from "../entities-table-data";
import type { FunctionComponent } from "react";

type SortControlProps = {
  sort: GridSort<SortableEntitiesTableColumnKey>;
  setSort: (sort: GridSort<SortableEntitiesTableColumnKey>) => void;
};

/**
 * Property columns are deliberately omitted: sorting by a property compiles
 * to an unindexed ORDER BY on the JSONB properties column in the graph.
 * Property sorting can be re-enabled once properties are indexed.
 */
const sortOptions: {
  columnKey: SortableEntitiesTableColumnKey;
  label: string;
}[] = [
  { columnKey: "entityLabel", label: "Entity" },
  { columnKey: "lastEdited", label: "Last Edited" },
  { columnKey: "created", label: "Created" },
  { columnKey: "entityTypes", label: "Entity Type" },
  { columnKey: "archived", label: "Archived" },
];

export const SortControl: FunctionComponent<SortControlProps> = ({
  sort,
  setSort,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-sort-control",
  });

  const activeLabel =
    sortOptions.find((option) => option.columnKey === sort.columnKey)?.label ??
    sort.columnKey;

  const handleSelect = (columnKey: SortableEntitiesTableColumnKey) => {
    if (columnKey === sort.columnKey) {
      setSort({
        columnKey,
        direction: sort.direction === "asc" ? "desc" : "asc",
      });
    } else {
      setSort({ columnKey, direction: "asc" });
    }
    popupState.close();
  };

  const DirectionIcon =
    sort.direction === "asc" ? ArrowDownAZRegularIcon : ArrowUpZARegularIcon;

  return (
    <Box>
      <Tooltip title="Sort entities" placement="top">
        <TableHeaderButton
          {...bindTrigger(popupState)}
          startIcon={<DirectionIcon />}
          endIcon={
            <CaretDownSolidIcon
              sx={{
                fontSize: 12,
                transform: `rotate(${popupState.isOpen ? 180 : 0}deg)`,
              }}
            />
          }
          sx={{ borderRadius: "4px", px: 1.25 }}
        >
          Sort: {activeLabel}
        </TableHeaderButton>
      </Tooltip>
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {sortOptions.map((option) => {
          const isActive = option.columnKey === sort.columnKey;
          return (
            <MenuItem
              key={option.columnKey}
              selected={isActive}
              onClick={() => handleSelect(option.columnKey)}
              sx={{ minWidth: 220 }}
            >
              <ListItemText primary={option.label} />
              {isActive && (
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    ml: 1,
                  }}
                >
                  <DirectionIcon sx={{ fontSize: 14 }} />
                </Box>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
};
