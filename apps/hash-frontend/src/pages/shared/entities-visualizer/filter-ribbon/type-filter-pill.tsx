import {
  Box,
  Checkbox,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { TextField } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { MenuItem } from "../../../../shared/ui";
import { FilterPill } from "./filter-pill";

import type { TypeFilterState } from "./types";
import type { AvailableType } from "./use-available-types";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

const summarise = ({
  filterState,
  available,
}: {
  filterState: TypeFilterState;
  available: AvailableType[];
}): { summary: string; isActive: boolean } => {
  if (filterState.selectedTypeIds === null) {
    return { summary: "Any type", isActive: false };
  }

  const selectedCount = filterState.selectedTypeIds.size;

  if (selectedCount === 0) {
    return { summary: "None", isActive: true };
  }

  if (selectedCount === 1) {
    const [only] = filterState.selectedTypeIds;
    const match = available.find((type) => type.entityTypeId === only);
    return { summary: match?.title ?? "Unknown type", isActive: true };
  }

  return { summary: `${selectedCount} types`, isActive: true };
};

export const TypeFilterPill: FunctionComponent<{
  filterState: TypeFilterState;
  setFilterState: (next: TypeFilterState) => void;
  available: AvailableType[];
  loading: boolean;
}> = ({ filterState, setFilterState, available, loading }) => {
  const { summary, isActive } = summarise({ filterState, available });

  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    setSearchText("");
  }, [available.length]);

  const visibleOptions = useMemo(() => {
    const lower = searchText.trim().toLowerCase();
    if (!lower) {
      return available;
    }
    return available.filter((type) => type.title.toLowerCase().includes(lower));
  }, [available, searchText]);

  const allTypeIds = useMemo(
    () => available.map((type) => type.entityTypeId),
    [available],
  );

  const unknownSelectedIds = useMemo(() => {
    if (filterState.selectedTypeIds === null) {
      return [] as VersionedUrl[];
    }
    const availableIds = new Set(allTypeIds);
    return [...filterState.selectedTypeIds].filter(
      (id) => !availableIds.has(id),
    );
  }, [filterState.selectedTypeIds, allTypeIds]);

  const isChecked = (entityTypeId: VersionedUrl) => {
    if (filterState.selectedTypeIds === null) {
      return true;
    }
    return filterState.selectedTypeIds.has(entityTypeId);
  };

  const toggle = (entityTypeId: VersionedUrl) => {
    /**
     * First click on any type: convert the implicit "any type" state into an
     * explicit set with everything checked, then uncheck the clicked one.
     */
    const current =
      filterState.selectedTypeIds ?? new Set<VersionedUrl>(allTypeIds);
    const next = new Set(current);
    if (next.has(entityTypeId)) {
      next.delete(entityTypeId);
    } else {
      next.add(entityTypeId);
    }
    /**
     * Note: we deliberately do NOT auto-collapse back to "any type" when the
     * user's set happens to cover everything currently available. The set of
     * available types depends on the active web filter, so collapsing here
     * would silently include newly-appearing types if the web filter is later
     * widened. The user has an explicit "Reset" button when they want "any
     * type".
     */
    setFilterState({ ...filterState, selectedTypeIds: next });
  };

  const selectOnly = (entityTypeId: VersionedUrl) => {
    setFilterState({
      ...filterState,
      selectedTypeIds: new Set<VersionedUrl>([entityTypeId]),
    });
  };

  const reset = () => {
    setFilterState({ ...filterState, selectedTypeIds: null });
  };

  return (
    <FilterPill label="Type is" valueSummary={summary} isActive={isActive}>
      {(close) => (
        <Box
          sx={{
            minWidth: 280,
            maxHeight: 400,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1.5, pt: 1, pb: 0.5 }}
          >
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[60],
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              {loading ? "Loading…" : `${available.length} types`}
            </Typography>
            {isActive && (
              <Box
                component="button"
                type="button"
                onClick={reset}
                sx={({ palette }) => ({
                  background: "transparent",
                  border: "none",
                  color: palette.blue[70],
                  cursor: "pointer",
                  fontSize: 12,
                  px: 0.5,
                })}
              >
                Reset
              </Box>
            )}
          </Stack>
          {available.length > 8 && (
            <Box sx={{ px: 1, pb: 0.5 }}>
              <TextField
                autoFocus
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Find types…"
                sx={{
                  width: "100%",
                  [`.${outlinedInputClasses.root} input`]: {
                    fontSize: 13,
                    py: 0.5,
                    px: 1.5,
                  },
                }}
              />
            </Box>
          )}
          <Box sx={{ overflowY: "auto", flex: 1 }}>
            {unknownSelectedIds.map((id) => (
              <MenuItem key={id} onClick={() => toggle(id)} sx={{ py: 0.5 }}>
                <Checkbox checked size="small" sx={{ mr: 1, p: 0.25 }} />
                <Typography
                  sx={{
                    color: ({ palette }) => palette.gray[60],
                    fontSize: 13,
                    fontStyle: "italic",
                    flex: 1,
                  }}
                >
                  Unknown type
                </Typography>
              </MenuItem>
            ))}
            {visibleOptions.length === 0
              ? unknownSelectedIds.length === 0 && (
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[60],
                      fontSize: 12,
                      px: 1.5,
                      py: 1,
                    }}
                  >
                    {loading ? "Loading…" : "No types"}
                  </Typography>
                )
              : visibleOptions.map((type) => {
                  const checked = isChecked(type.entityTypeId);
                  return (
                    <MenuItem
                      key={type.entityTypeId}
                      onClick={() => toggle(type.entityTypeId)}
                      sx={{
                        py: 0.5,
                        "&:hover .only-button": { visibility: "visible" },
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        size="small"
                        sx={{ mr: 1, p: 0.25 }}
                      />
                      <Typography sx={{ fontSize: 13, flex: 1 }}>
                        {type.title}
                        <Box
                          component="span"
                          sx={{
                            ml: 0.5,
                            color: ({ palette }) => palette.gray[50],
                            fontSize: 12,
                          }}
                        >
                          ({formatNumber(type.count)})
                        </Box>
                      </Typography>
                      <Box
                        className="only-button"
                        component="button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectOnly(type.entityTypeId);
                          close();
                        }}
                        sx={({ palette }) => ({
                          background: "transparent",
                          border: "none",
                          color: palette.blue[70],
                          cursor: "pointer",
                          fontSize: 11,
                          ml: 1,
                          visibility: "hidden",
                        })}
                      >
                        Only
                      </Box>
                    </MenuItem>
                  );
                })}
          </Box>
        </Box>
      )}
    </FilterPill>
  );
};
