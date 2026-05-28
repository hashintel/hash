import { Box, ListItemText, Menu, Tooltip } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useMemo } from "react";

import { isBaseUrl } from "@blockprotocol/type-system";
import { CaretDownSolidIcon } from "@hashintel/design-system";

import { ArrowDownAZRegularIcon } from "../../../../shared/icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../../shared/icons/arrow-up-a-z-regular-icon";
import { TableHeaderButton } from "../../../../shared/table-header/table-header-button";
import { MenuItem } from "../../../../shared/ui";

import type { GridSort } from "../../../../components/grid/grid";
import type {
  EntitiesTableColumnKey,
  SortableEntitiesTableColumnKey,
} from "../types";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { FunctionComponent } from "react";

type SortControlProps = {
  columns: SizedGridColumn[];
  sort: GridSort<SortableEntitiesTableColumnKey>;
  setSort: (
    sort: GridSort<SortableEntitiesTableColumnKey> & {
      convertTo?: BaseUrl;
    },
  ) => void;
};

const staticSortOptions: {
  columnKey: Extract<
    SortableEntitiesTableColumnKey,
    "entityLabel" | "lastEdited" | "created" | "entityTypes" | "archived"
  >;
  label: string;
}[] = [
  { columnKey: "entityLabel", label: "Entity" },
  { columnKey: "lastEdited", label: "Last Edited" },
  { columnKey: "created", label: "Created" },
  { columnKey: "entityTypes", label: "Entity Type" },
  { columnKey: "archived", label: "Archived" },
];

export const SortControl: FunctionComponent<SortControlProps> = ({
  columns,
  sort,
  setSort,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-sort-control",
  });

  const options = useMemo(() => {
    const propertyColumnOptions: {
      columnKey: SortableEntitiesTableColumnKey;
      label: string;
    }[] = [];

    for (const column of columns) {
      const columnId = column.id as EntitiesTableColumnKey | undefined;
      if (columnId && isBaseUrl(columnId)) {
        propertyColumnOptions.push({
          columnKey: columnId,
          label: column.title,
        });
      }
    }

    return [...staticSortOptions, ...propertyColumnOptions];
  }, [columns]);

  const activeLabel =
    options.find((option) => option.columnKey === sort.columnKey)?.label ??
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
        {options.map((option) => {
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
                  display="inline-flex"
                  alignItems="center"
                  ml={1}
                  sx={{ color: ({ palette }) => palette.common.white }}
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
