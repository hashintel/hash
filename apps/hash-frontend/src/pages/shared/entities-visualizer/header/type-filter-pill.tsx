import { Box, ListItemText, Menu, Typography } from "@mui/material";
import { bindMenu, usePopupState } from "material-ui-popup-state/hooks";
import { useCallback, useMemo, useState } from "react";

import { MenuCheckboxItem, TextField } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { AsteriskLightIcon } from "../../../../shared/icons/asterisk-light-icon";
import { resolveTypeColor, typeColorRanks } from "../shared/type-colors";
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
  /**
   * Type ids to hide from the menu (the graph view's link types). They stay part
   * of the selection universe used by toggle / select-all, so a hidden type that
   * was selected elsewhere (e.g. the table view) is preserved rather than dropped
   * — only the row, the count and the label ignore them.
   */
  hiddenTypeIds?: ReadonlySet<VersionedUrl>;
};

/** Whether every id in `availableIds` is selected (a subset check that ignores
 * any selected id outside that set, e.g. a hidden or unknown type). */
const allTypesSelected = ({
  selectedTypeIds,
  availableIds,
}: {
  selectedTypeIds: Set<VersionedUrl> | null;
  availableIds: VersionedUrl[];
}) => {
  if (selectedTypeIds === null) {
    return true;
  }
  if (availableIds.length === 0) {
    return false;
  }
  return availableIds.every((id) => selectedTypeIds.has(id));
};

const buildLabel = ({
  availableTypes,
  selectedTypeIds,
  availableIds,
}: {
  availableTypes: AvailableType[];
  selectedTypeIds: Set<VersionedUrl> | null;
  availableIds: VersionedUrl[];
}): string => {
  if (allTypesSelected({ selectedTypeIds, availableIds })) {
    return "any";
  }

  const selectedIds = selectedTypeIds
    ? availableIds.filter((id) => selectedTypeIds.has(id))
    : availableIds;

  if (selectedIds.length === 0) {
    return "none";
  }

  if (selectedIds.length === 1) {
    const [only] = selectedIds;
    const match = availableTypes.find((type) => type.entityTypeId === only);
    return match?.title ?? "1 type";
  }

  return `one of ${selectedIds.length}`;
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
  hiddenTypeIds,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-type-filter-pill",
  });

  const [searchQuery, setSearchQuery] = useState("");

  // The full selection universe — hidden types included — so toggle / select-all
  // never drop a hidden-but-selected type from the shared state.
  const allAvailableIds = useMemo(
    () => availableTypes.map((type) => type.entityTypeId),
    [availableTypes],
  );

  // The types the menu actually shows and the label / count reflect: everything
  // but the hidden (link) types.
  const visibleTypes = useMemo(
    () =>
      hiddenTypeIds
        ? availableTypes.filter((type) => !hiddenTypeIds.has(type.entityTypeId))
        : availableTypes,
    [availableTypes, hiddenTypeIds],
  );
  const visibleAvailableIds = useMemo(
    () => visibleTypes.map((type) => type.entityTypeId),
    [visibleTypes],
  );

  // Default colour rank by entity count: the most common types get the distinct
  // palette colours (regardless of the list's alphabetical order or any search
  // filter), and the long tail falls through to grey.
  const colorIndexByType = useMemo(
    () => typeColorRanks(visibleTypes),
    [visibleTypes],
  );

  const allSelected = allTypesSelected({
    selectedTypeIds: typeState.selectedTypeIds,
    availableIds: visibleAvailableIds,
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
    availableTypes: visibleTypes,
    selectedTypeIds: typeState.selectedTypeIds,
    availableIds: visibleAvailableIds,
  });

  // A selected id that isn't in the full universe at all (e.g. a type from a
  // different web). Hidden types are part of the universe, so they never surface
  // here — they are omitted from the menu silently.
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
      return visibleTypes;
    }
    return visibleTypes.filter((type) =>
      type.title.toLowerCase().includes(query),
    );
  }, [visibleTypes, searchQuery]);

  const isActive = !allSelected;

  const renderListContent = () => {
    const showEmpty =
      filteredTypes.length === 0 && unknownSelectedIds.length === 0 && !loading;

    if (showEmpty) {
      return (
        <TypeFilterMessage
          text={visibleTypes.length === 0 ? "No types" : "No matches"}
        />
      );
    }

    const showLoading = loading && visibleTypes.length === 0;

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
              {visibleTypes.length} type
              {visibleTypes.length === 1 ? "" : "s"}
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
