import {
  Box,
  ClickAwayListener,
  Fade,
  Paper,
  Popper,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo, useRef, useState } from "react";

import { XMarkRegularIcon } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { PlusRegularIcon } from "../../../../shared/icons/plus-regular";
import { MenuItem } from "../../../../shared/ui";
import { IncludeArchivedPill } from "./include-archived-pill";
import { TypeFilterPill } from "./type-filter-pill";
import { WebFilterPill } from "./web-filter-pill";

import type { EntitiesFilterState } from "./types";
import type { AvailableType } from "./use-available-types";
import type { WebFilterOption } from "./web-filter-pill";
import type { FunctionComponent } from "react";

type AddableFilter = "archived";

const AddFilterButton: FunctionComponent<{
  options: { value: AddableFilter; label: string; disabled?: boolean }[];
  onAdd: (filter: AddableFilter) => void;
}> = ({ options, onAdd }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const enabledOptions = options.filter((option) => !option.disabled);

  if (enabledOptions.length === 0) {
    return null;
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        ref={anchorRef}
        onClick={() => setOpen((prev) => !prev)}
        sx={({ palette }) => ({
          alignItems: "center",
          background: "transparent",
          border: `1px dashed ${palette.gray[40]}`,
          borderRadius: 1.5,
          color: palette.gray[70],
          cursor: "pointer",
          display: "inline-flex",
          fontSize: 12,
          gap: 0.5,
          height: 28,
          px: 1.25,
          "&:hover": {
            background: palette.gray[10],
            color: palette.gray[90],
          },
        })}
      >
        <PlusRegularIcon sx={{ fontSize: 10 }} />
        Add filter
      </Box>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        transition
        sx={{ zIndex: 1300 }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={150}>
            <Box sx={{ mt: 0.5 }}>
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <Paper
                  sx={({ palette }) => ({
                    border: `1px solid ${palette.gray[30]}`,
                    borderRadius: 1,
                    boxShadow: "0px 4px 16px rgba(0,0,0,0.08)",
                    minWidth: 200,
                  })}
                >
                  <Stack sx={{ py: 0.5 }}>
                    {enabledOptions.map((option) => (
                      <MenuItem
                        key={option.value}
                        onClick={() => {
                          onAdd(option.value);
                          setOpen(false);
                        }}
                        sx={{ fontSize: 13, py: 0.5 }}
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                  </Stack>
                </Paper>
              </ClickAwayListener>
            </Box>
          </Fade>
        )}
      </Popper>
    </>
  );
};

export const FilterRibbon: FunctionComponent<{
  filterState: EntitiesFilterState;
  setFilterState: (next: EntitiesFilterState) => void;
  webOptions: WebFilterOption[];
  availableTypes: AvailableType[];
  availableTypesLoading: boolean;
  hideTypeFilter: boolean;
  /**
   * `null` means we don't know yet (initial load).
   */
  resultCount: number | null;
  loading: boolean;
  onClear?: () => void;
}> = ({
  filterState,
  setFilterState,
  webOptions,
  availableTypes,
  availableTypesLoading,
  hideTypeFilter,
  resultCount,
  loading,
  onClear,
}) => {
  const addableOptions = useMemo<
    { value: AddableFilter; label: string; disabled?: boolean }[]
  >(
    () => [
      {
        value: "archived",
        label: "Include archived",
        disabled: filterState.archived.pillAdded,
      },
    ],
    [filterState.archived.pillAdded],
  );

  return (
    <Stack
      direction="row"
      alignItems="center"
      flexWrap="wrap"
      gap={1}
      sx={{ width: "100%" }}
    >
      <WebFilterPill
        filterState={filterState.web}
        setFilterState={(web) => setFilterState({ ...filterState, web })}
        options={webOptions}
      />
      {!hideTypeFilter && (
        <TypeFilterPill
          filterState={filterState.type}
          setFilterState={(type) => setFilterState({ ...filterState, type })}
          available={availableTypes}
          loading={availableTypesLoading}
        />
      )}
      {filterState.archived.pillAdded && (
        <IncludeArchivedPill
          archived={filterState.archived}
          setArchived={(archived) =>
            setFilterState({ ...filterState, archived })
          }
        />
      )}
      <AddFilterButton
        options={addableOptions}
        onAdd={() => {
          /**
           * Adding the pill defaults to `include: true` -- adding the pill is
           * itself a deliberate action to include archived entities, since
           * `include: false` matches the silent default with no pill at all.
           */
          setFilterState({
            ...filterState,
            archived: { pillAdded: true, include: true },
          });
        }}
      />
      {onClear && (
        <Box
          component="button"
          type="button"
          onClick={onClear}
          aria-label="Clear all filters"
          sx={({ palette }) => ({
            alignItems: "center",
            background: "transparent",
            border: "none",
            color: palette.gray[70],
            cursor: "pointer",
            display: "inline-flex",
            fontSize: 13,
            gap: 0.5,
            height: 28,
            px: 0.5,
            "&:hover": {
              color: palette.gray[90],
            },
          })}
        >
          <XMarkRegularIcon sx={{ fontSize: 12 }} />
          Clear
        </Box>
      )}
      <Box sx={{ flex: 1 }} />
      <Typography
        sx={{
          color: ({ palette }) => palette.gray[70],
          fontSize: 13,
          fontWeight: 500,
          minWidth: 80,
          textAlign: "right",
        }}
      >
        {loading
          ? "Loading…"
          : resultCount !== null
            ? `${formatNumber(resultCount)} result${resultCount === 1 ? "" : "s"}`
            : ""}
      </Typography>
    </Stack>
  );
};
