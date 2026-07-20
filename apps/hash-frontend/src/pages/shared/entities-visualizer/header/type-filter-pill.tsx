import { Box, ListItemText, Menu, Typography } from "@mui/material";
import { bindMenu, usePopupState } from "material-ui-popup-state/hooks";
import { useCallback, useMemo, useState } from "react";

import { MenuCheckboxItem, TextField } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { AsteriskLightIcon } from "../../../../shared/icons/asterisk-light-icon";
import { resolveTypeColor } from "../shared/type-colors";
import { FilterPill } from "./filter-pill";
import { triggerSwatchSize, TypeColorSelector } from "./type-color-selector";

import type { EntitiesFilterState } from "../shared/filter-state";
import type { TypeColorOverrides } from "../shared/type-colors";
import type { AvailableType } from "../shared/use-available-types";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

type TypeFilterPillProps = {
  availableTypes: AvailableType[];
  loading: boolean;
  typeState: EntitiesFilterState["type"];
  setTypeState: (
    updater: (prev: EntitiesFilterState["type"]) => EntitiesFilterState["type"],
  ) => void;
  /** Show a per-type colour selector (network graph view only). */
  showColors: boolean;
  typeColorOverrides: TypeColorOverrides;
  setTypeColor: (entityTypeId: VersionedUrl, color: string) => void;
};

const isAllSelected = ({
  selectedTypeIds,
  allAvailableIds,
}: {
  selectedTypeIds: Set<VersionedUrl> | null;
  allAvailableIds: VersionedUrl[];
}) => {
  if (selectedTypeIds === null) {
    return true;
  }
  if (allAvailableIds.length === 0) {
    return false;
  }
  if (selectedTypeIds.size !== allAvailableIds.length) {
    return false;
  }
  return allAvailableIds.every((id) => selectedTypeIds.has(id));
};

const buildLabel = ({
  availableTypes,
  selectedTypeIds,
  allAvailableIds,
}: {
  availableTypes: AvailableType[];
  selectedTypeIds: Set<VersionedUrl> | null;
  allAvailableIds: VersionedUrl[];
}): string => {
  if (isAllSelected({ selectedTypeIds, allAvailableIds })) {
    return "any";
  }

  const count = selectedTypeIds?.size ?? 0;

  if (count === 0) {
    return "none";
  }

  if (count === 1) {
    const [only] = selectedTypeIds!;
    const match = availableTypes.find((type) => type.entityTypeId === only);
    return match?.title ?? "1 type";
  }

  return `one of ${count}`;
};

type TypeFilterMenuItemProps = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
  checked: boolean;
  onToggle: (entityTypeId: VersionedUrl) => void;
  onSelectOnly: (entityTypeId: VersionedUrl) => void;
  color?: string;
  onColorChange?: (color: string) => void;
};

const TypeFilterMenuItem: FunctionComponent<TypeFilterMenuItemProps> = ({
  entityTypeId,
  title,
  count,
  checked,
  onToggle,
  onSelectOnly,
  color,
  onColorChange,
}) => (
  <MenuCheckboxItem
    selected={checked}
    onClick={() => onToggle(entityTypeId)}
    sx={{
      minWidth: 260,
      "&:hover .type-filter-only-button": {
        visibility: "visible",
      },
      "&:hover .type-filter-count": {
        visibility: "hidden",
      },
    }}
  >
    {color !== undefined &&
      onColorChange && (
        // Always reserve the swatch's space (before the checkbox via `order: -1`)
        // so rows stay aligned; only show the swatch when the type is selected.
        <Box
          sx={{
            order: -1,
            mr: 1,
            display: "inline-flex",
            flexShrink: 0,
            width: `${triggerSwatchSize}px`,
          }}
        >
          {checked && (
            <TypeColorSelector
              entityTypeId={entityTypeId}
              color={color}
              onChange={onColorChange}
            />
          )}
        </Box>
      )}
    <ListItemText
      primary={title}
      primaryTypographyProps={{
        sx: {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      }}
    />
    <Box sx={{ ml: 1, position: "relative", display: "inline-flex" }}>
      <Typography
        className="type-filter-count"
        sx={{
          color: ({ palette }) => palette.gray[50],
          fontSize: 12,
        }}
      >
        {formatNumber(count)}
      </Typography>
      <Box
        className="type-filter-only-button"
        component="span"
        onClick={(event) => {
          event.stopPropagation();
          onSelectOnly(entityTypeId);
        }}
        sx={{
          visibility: "hidden",
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          color: ({ palette }) => palette.blue[70],
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          "&:hover": { textDecoration: "underline" },
        }}
      >
        Only
      </Box>
    </Box>
  </MenuCheckboxItem>
);

const TypeFilterMessage: FunctionComponent<{ text: string }> = ({ text }) => (
  <Box sx={{ px: 1.5, py: 1, minWidth: 220 }}>
    <Typography sx={{ color: ({ palette }) => palette.gray[60], fontSize: 13 }}>
      {text}
    </Typography>
  </Box>
);

export const TypeFilterPill: FunctionComponent<TypeFilterPillProps> = ({
  availableTypes,
  loading,
  typeState,
  setTypeState,
  showColors,
  typeColorOverrides,
  setTypeColor,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-type-filter-pill",
  });

  const [searchQuery, setSearchQuery] = useState("");

  const allAvailableIds = useMemo(
    () => availableTypes.map((type) => type.entityTypeId),
    [availableTypes],
  );

  // Position of each type in the (alphabetical) available list, so the first ten
  // types get their default colour by position regardless of any search filter.
  const colorIndexByType = useMemo(() => {
    const map = new Map<VersionedUrl, number>();
    for (const [index, type] of availableTypes.entries()) {
      map.set(type.entityTypeId, index);
    }
    return map;
  }, [availableTypes]);

  const allSelected = isAllSelected({
    selectedTypeIds: typeState.selectedTypeIds,
    allAvailableIds,
  });

  const isChecked = useCallback(
    (entityTypeId: VersionedUrl) => {
      if (typeState.selectedTypeIds === null) {
        return true;
      }
      return typeState.selectedTypeIds.has(entityTypeId);
    },
    [typeState.selectedTypeIds],
  );

  const toggle = useCallback(
    (entityTypeId: VersionedUrl) => {
      setTypeState((prev) => {
        const current =
          prev.selectedTypeIds ?? new Set<VersionedUrl>(allAvailableIds);
        const next = new Set(current);
        if (next.has(entityTypeId)) {
          next.delete(entityTypeId);
        } else {
          next.add(entityTypeId);
        }
        if (
          next.size === allAvailableIds.length &&
          allAvailableIds.every((id) => next.has(id))
        ) {
          return { selectedTypeIds: null };
        }
        return { selectedTypeIds: next };
      });
    },
    [allAvailableIds, setTypeState],
  );

  const selectOnly = useCallback(
    (entityTypeId: VersionedUrl) => {
      setTypeState(() => ({
        selectedTypeIds: new Set<VersionedUrl>([entityTypeId]),
      }));
    },
    [setTypeState],
  );

  const selectAll = useCallback(() => {
    setTypeState(() => ({ selectedTypeIds: null }));
  }, [setTypeState]);

  const label = buildLabel({
    availableTypes,
    selectedTypeIds: typeState.selectedTypeIds,
    allAvailableIds,
  });

  const unknownSelectedIds = useMemo<VersionedUrl[]>(() => {
    if (typeState.selectedTypeIds === null) {
      return [];
    }
    const availableIdSet = new Set(allAvailableIds);
    return [...typeState.selectedTypeIds].filter(
      (id) => !availableIdSet.has(id),
    );
  }, [typeState.selectedTypeIds, allAvailableIds]);

  const filteredTypes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return availableTypes;
    }
    return availableTypes.filter((type) =>
      type.title.toLowerCase().includes(query),
    );
  }, [availableTypes, searchQuery]);

  const isActive = !allSelected;

  const renderListContent = () => {
    const showEmpty =
      filteredTypes.length === 0 && unknownSelectedIds.length === 0 && !loading;

    if (showEmpty) {
      return (
        <TypeFilterMessage
          text={availableTypes.length === 0 ? "No types" : "No matches"}
        />
      );
    }

    const showLoading = loading && availableTypes.length === 0;

    if (showLoading) {
      return <TypeFilterMessage text="Loading…" />;
    }

    const showUnknownTypes = !searchQuery;

    /**
     * MUI's `Menu` iterates over its children to manage focus and keyboard
     * navigation, and warns if any child is a `Fragment`. We therefore return a
     * flat array of menu items rather than wrapping them in a `Fragment`.
     */
    return [
      ...(showUnknownTypes
        ? unknownSelectedIds.map((id) => (
            <MenuCheckboxItem
              key={`unknown-${id}`}
              selected
              onClick={() => toggle(id)}
              sx={{ minWidth: 260 }}
            >
              <ListItemText
                primary="Unknown type"
                primaryTypographyProps={{
                  sx: {
                    fontStyle: "italic",
                    color: ({ palette }) => palette.gray[60],
                  },
                }}
              />
            </MenuCheckboxItem>
          ))
        : []),
      ...filteredTypes.map(({ entityTypeId, title, count }) => (
        <TypeFilterMenuItem
          key={entityTypeId}
          entityTypeId={entityTypeId}
          title={title}
          count={count}
          checked={isChecked(entityTypeId)}
          onToggle={toggle}
          onSelectOnly={selectOnly}
          color={
            showColors
              ? resolveTypeColor({
                  entityTypeId,
                  index: colorIndexByType.get(entityTypeId) ?? Infinity,
                  overrides: typeColorOverrides,
                })
              : undefined
          }
          onColorChange={
            showColors
              ? (color) => setTypeColor(entityTypeId, color)
              : undefined
          }
        />
      )),
    ];
  };

  return (
    <Box>
      <FilterPill
        icon={AsteriskLightIcon}
        prefix="Type is"
        value={label}
        active={isActive}
        popupState={popupState}
      />
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{ vertical: 30, horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxHeight: 420, width: 300 } } }}
        TransitionProps={{
          onEntered: () => {
            setSearchQuery("");
          },
        }}
      >
        <Box
          sx={{
            px: 1.25,
            pt: 1,
            pb: 0.75,
            position: "sticky",
            top: 0,
            background: ({ palette }) => palette.common.white,
            zIndex: 1,
          }}
        >
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Search types…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              // Prevent MUI Menu auto-focus / typeahead from stealing keys.
              event.stopPropagation();
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                fontSize: 13,
              },
              "& .MuiOutlinedInput-input": {
                py: 0.75,
              },
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 0.5,
              px: 0.25,
            }}
          >
            <Typography
              sx={{ color: ({ palette }) => palette.gray[60], fontSize: 11 }}
            >
              {availableTypes.length} type
              {availableTypes.length === 1 ? "" : "s"}
            </Typography>
            <Box
              component="button"
              type="button"
              onClick={selectAll}
              disabled={allSelected}
              sx={{
                background: "transparent",
                border: "none",
                p: 0,
                cursor: allSelected ? "default" : "pointer",
                color: ({ palette }) =>
                  allSelected ? palette.gray[40] : palette.blue[70],
                fontSize: 11,
                fontWeight: 500,
                "&:hover": {
                  textDecoration: allSelected ? "none" : "underline",
                },
              }}
            >
              Select all
            </Box>
          </Box>
        </Box>

        {renderListContent()}
      </Menu>
    </Box>
  );
};
