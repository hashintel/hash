import {
  Box,
  Checkbox,
  chipClasses,
  ListItemText,
  Menu,
  Typography,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useCallback, useMemo } from "react";

import { CaretDownSolidIcon, Chip } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { AsteriskLightIcon } from "../../../../shared/icons/asterisk-light-icon";
import { MenuItem } from "../../../../shared/ui";

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

const buildLabel = ({
  availableTypes,
  selectedTypeIds,
}: {
  availableTypes: AvailableType[];
  selectedTypeIds: Set<VersionedUrl> | null;
}): string => {
  if (selectedTypeIds === null) {
    return "All types";
  }

  const count = selectedTypeIds.size;

  if (count === 0) {
    return "No types";
  }

  if (count === 1) {
    const [only] = selectedTypeIds;
    const match = availableTypes.find((type) => type.entityTypeId === only);
    return match?.title ?? "1 type";
  }

  return `${count} types`;
};

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

  const allAvailableIds = useMemo(
    () => availableTypes.map((type) => type.entityTypeId),
    [availableTypes],
  );

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
        return { selectedTypeIds: next };
      });
    },
    [allAvailableIds, setTypeState],
  );

  const label = buildLabel({
    availableTypes,
    selectedTypeIds: typeState.selectedTypeIds,
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

  return (
    <Box>
      <Chip
        icon={
          <AsteriskLightIcon
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
            {label}
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
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
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
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        {availableTypes.length === 0 && unknownSelectedIds.length === 0 ? (
          <Box sx={{ px: 1.5, py: 1, minWidth: 220 }}>
            <Typography
              sx={{ color: ({ palette }) => palette.gray[60], fontSize: 13 }}
            >
              {loading ? "Loading…" : "No types"}
            </Typography>
          </Box>
        ) : null}
        {unknownSelectedIds.map((id) => (
          <MenuItem key={id} onClick={() => toggle(id)} sx={{ minWidth: 260 }}>
            <Checkbox
              checked
              sx={{ p: 0, mr: 1, svg: { width: 14, height: 14 } }}
            />
            <ListItemText
              primary="Unknown type"
              primaryTypographyProps={{
                sx: {
                  fontStyle: "italic",
                  color: ({ palette }) => palette.gray[60],
                },
              }}
            />
          </MenuItem>
        ))}
        {availableTypes.map(({ entityTypeId, title, count }) => {
          const checked = isChecked(entityTypeId);
          return (
            <MenuItem
              key={entityTypeId}
              onClick={() => toggle(entityTypeId)}
              sx={{ minWidth: 260 }}
            >
              <Checkbox
                checked={checked}
                sx={{ p: 0, mr: 1, svg: { width: 14, height: 14 } }}
              />
              <ListItemText primary={title} />
              <Typography
                sx={{
                  ml: 1,
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 12,
                }}
              >
                {formatNumber(count)}
              </Typography>
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
};
