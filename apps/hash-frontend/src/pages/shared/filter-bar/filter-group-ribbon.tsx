import { Box } from "@mui/material";

import { FilterGroup, Menu } from "@hashintel/ds-components";

import { DsComponentsScope } from "../ds-components-scope";

import type { ItemOrGroup, MenuItem } from "@hashintel/ds-components";
import type { SxProps, Theme } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

const chipWrapperSx: SxProps<Theme> = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
};

/**
 * The shared shell of a filter bar's chip ribbon: leading pills, the active
 * filter chips, an add-filter menu and a clear-all control, in a
 * `display: contents` wrapper so everything flows inline in the header bar
 * with uniform margins (which is also what spaces wrapped rows — don't host
 * this inside a flex container with its own gap).
 */
export const FilterGroupRibbon: FunctionComponent<{
  /** Pills leading the chip group (search toggle, web/type pills). */
  leadingControls?: ReactNode;
  /** The active filter chips, each keyed by its filter's stable id. */
  chips: Array<{ id: string; chip: ReactNode }>;
  addFilterMenuItems: Array<ItemOrGroup<MenuItem>>;
  /** Optional header for the add-filter menu (e.g. a search input). */
  addFilterMenuHeader?: ReactNode;
  onAddFilterMenuOpen?: (open: boolean) => void;
  /** Fires from the clear-all control, shown once more than one chip is active. */
  onClearFilters: () => void;
}> = ({
  leadingControls,
  chips,
  addFilterMenuItems,
  addFilterMenuHeader,
  onAddFilterMenuOpen,
  onClearFilters,
}) => {
  const trailingControls = (
    <>
      <Menu
        trigger={
          <FilterGroup.AddFilter
            renderAs={chips.length > 0 ? "plus" : "plusLabel"}
          />
        }
        items={addFilterMenuItems}
        header={addFilterMenuHeader}
        swapHeaderFooterOnFlip={addFilterMenuHeader !== undefined}
        onOpen={onAddFilterMenuOpen}
      />
      {chips.length > 1 && (
        <FilterGroup.ClearFilters
          aria-label="Clear filters"
          onClick={onClearFilters}
        />
      )}
    </>
  );

  return (
    <Box
      sx={{
        display: "contents",
        "& .MuiChip-root, & > .MuiIconButton-root, & [data-part='filter-group'] > *":
          {
            verticalAlign: "middle",
            marginRight: 1,
            marginTop: 0.5,
            marginBottom: 0.5,
          },
        "& [data-part='filter-group']": {
          display: "contents !important",
        },
      }}
    >
      {leadingControls}
      <DsComponentsScope sx={{ display: "contents" }}>
        <FilterGroup dismissAbandoned>
          {chips.map(({ id, chip }, index) => (
            <Box key={id} sx={chipWrapperSx}>
              {chip}
              {index === chips.length - 1 && trailingControls}
            </Box>
          ))}
          {chips.length === 0 && (
            <Box sx={chipWrapperSx}>{trailingControls}</Box>
          )}
        </FilterGroup>
      </DsComponentsScope>
    </Box>
  );
};
