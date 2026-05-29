import { Box, ListItemText, Menu, Typography } from "@mui/material";
import { bindMenu, usePopupState } from "material-ui-popup-state/hooks";
import { useCallback, useMemo, useState } from "react";

import { MenuCheckboxItem, TextField } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { AsteriskLightIcon } from "../../../../shared/icons/asterisk-light-icon";
import { FilterPill } from "./filter-pill";

import type { EntitiesFilterState } from "../data/types";
import type { AvailableType } from "../data/use-available-types";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

type TypeFilterPillProps = {
  availableTypes: AvailableType[];
  loading: boolean;
  typeState: EntitiesFilterState["type"];
  setTypeState: (
    updater: (prev: EntitiesFilterState["type"]) => EntitiesFilterState["type"],
  ) => void;
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
    return "All types";
  }

  const count = selectedTypeIds?.size ?? 0;

  if (count === 0) {
    return "No types";
  }

  if (count === 1) {
    const [only] = selectedTypeIds!;
    const match = availableTypes.find((type) => type.entityTypeId === only);
    return match?.title ?? "1 type";
  }

  return `${count} types`;
};

type TypeFilterMenuItemProps = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
  checked: boolean;
  onToggle: (entityTypeId: VersionedUrl) => void;
  onSelectOnly: (entityTypeId: VersionedUrl) => void;
};

const TypeFilterMenuItem: FunctionComponent<TypeFilterMenuItemProps> = ({
  entityTypeId,
  title,
  count,
  checked,
  onToggle,
  onSelectOnly,
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

    return (
      <>
        {showUnknownTypes &&
          unknownSelectedIds.map((id) => (
            <MenuCheckboxItem
              key={id}
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
          ))}
        {filteredTypes.map(({ entityTypeId, title, count }) => (
          <TypeFilterMenuItem
            key={entityTypeId}
            entityTypeId={entityTypeId}
            title={title}
            count={count}
            checked={isChecked(entityTypeId)}
            onToggle={toggle}
            onSelectOnly={selectOnly}
          />
        ))}
      </>
    );
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
