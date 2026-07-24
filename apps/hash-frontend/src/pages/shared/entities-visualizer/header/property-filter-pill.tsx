import { Box, FormControl, Popover, Typography } from "@mui/material";
import {
  bindPopover,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useEffect, useRef, useState } from "react";

import {
  CaretDownSolidIcon,
  Chip,
  IconButton,
  Select,
  TextField,
  XMarkRegularIcon,
} from "@hashintel/design-system";

import { CheckRegularIcon } from "../../../../shared/icons/check-regular-icon";
import { FontCaseRegularIcon } from "../../../../shared/icons/font-case-regular-icon";
import { HashtagRegularIcon } from "../../../../shared/icons/hashtag-regular-icon";
import { Button, MenuItem } from "../../../../shared/ui";
import { isPropertyFilterActive } from "../shared/property-filters/build-property-filter-clause";
import {
  getOperatorDescriptor,
  getOperatorsForKind,
} from "../shared/property-filters/get-operators-for-kind";
import { activePillSx, incompletePillSx } from "./pill-styles";

import type {
  FilterValueKind,
  PropertyFilter,
  PropertyFilterOperator,
} from "../shared/property-filters/property-filter";
import type { SelectChangeEvent, SvgIconProps } from "@mui/material";
import type { ComponentType, FunctionComponent } from "react";

const kindIcon: Record<FilterValueKind, ComponentType<SvgIconProps>> = {
  number: HashtagRegularIcon,
  string: FontCaseRegularIcon,
  boolean: CheckRegularIcon,
};

type PropertyFilterPillProps = {
  filter: PropertyFilter;
  mode: "add" | "edit";
  /** Whether to open the editor automatically (just-added draft). */
  autoOpen: boolean;
  onCommit: (filter: PropertyFilter) => void;
  onRemove: () => void;
};

export const PropertyFilterPill: FunctionComponent<PropertyFilterPillProps> = ({
  filter,
  mode,
  autoOpen,
  onCommit,
  onRemove,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: `entities-visualizer-property-filter-${filter.id}`,
  });

  const anchorRef = useRef<HTMLDivElement>(null);

  const operators = getOperatorsForKind(filter.kind);

  const [operator, setOperator] = useState<PropertyFilterOperator>(
    filter.operator,
  );
  const [valueDraft, setValueDraft] = useState(filter.value ?? "");

  useEffect(() => {
    if (popupState.isOpen) {
      setOperator(filter.operator);
      setValueDraft(filter.value ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when (re)opening
  }, [popupState.isOpen]);

  useEffect(() => {
    if (autoOpen && anchorRef.current) {
      popupState.open(anchorRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to autoOpen flipping on
  }, [autoOpen]);

  const bufferDescriptor = getOperatorDescriptor(filter.kind, operator);
  const bufferRequiresValue = bufferDescriptor?.requiresValue ?? false;

  const bufferedFilter: PropertyFilter = {
    ...filter,
    operator,
    value: bufferRequiresValue ? valueDraft : undefined,
  };

  const canCommit = isPropertyFilterActive(bufferedFilter);

  const handleOperatorChange = (event: SelectChangeEvent) => {
    setOperator(event.target.value as PropertyFilterOperator);
  };

  const handleCommit = () => {
    if (!canCommit) {
      return;
    }
    onCommit(bufferedFilter);
    popupState.close();
  };

  const handleClose = () => {
    popupState.close();
    if (mode === "add") {
      // A draft that is never committed is discarded when its editor closes.
      onRemove();
    }
  };

  // Closed-pill display reflects only committed filters
  const descriptor = getOperatorDescriptor(filter.kind, filter.operator);
  const requiresValue = descriptor?.requiresValue ?? false;
  const connector = descriptor?.pillConnector ?? "";

  const active = mode === "edit" && isPropertyFilterActive(filter);

  const displayValue = filter.value ?? "";

  const prefix = requiresValue ? `${filter.title} ${connector}` : filter.title;

  const valueText = requiresValue
    ? active
      ? filter.kind === "string"
        ? `“${displayValue}”`
        : displayValue
      : "…"
    : connector;

  const Icon = kindIcon[filter.kind];

  return (
    <Box
      ref={anchorRef}
      sx={{
        display: "inline-flex",
      }}
    >
      <Chip
        icon={
          <Icon
            sx={{
              fill: ({ palette }) =>
                active ? palette.blue[70] : palette.gray[50],
            }}
          />
        }
        label={
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}
          >
            <Typography
              component="span"
              sx={{
                fontSize: 13,
                color: ({ palette }) =>
                  active ? palette.blue[70] : palette.gray[60],
              }}
            >
              {prefix}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: 13,
                fontWeight: 600,
                fontStyle: active ? "normal" : "italic",
                color: ({ palette }) =>
                  active ? palette.blue[90] : palette.gray[60],
              }}
            >
              {valueText}
            </Typography>
            <CaretDownSolidIcon
              sx={{
                fontSize: 12,
                transform: `rotate(${popupState.isOpen ? 180 : 0}deg)`,
              }}
            />
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              aria-label={`Remove ${filter.title} filter`}
              sx={{
                p: 0,
                ml: 0.1,
                color: ({ palette }) =>
                  active ? palette.blue[70] : palette.gray[50],
                "&:hover": {
                  color: ({ palette }) =>
                    active ? palette.blue[90] : palette.gray[70],
                  background: "transparent",
                },
              }}
            >
              <XMarkRegularIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Box>
        }
        sx={active ? activePillSx : incompletePillSx}
        {...bindTrigger(popupState)}
      />
      <Popover
        {...bindPopover(popupState)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 36, horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 260, p: 1.5 } } }}
      >
        <FormControl fullWidth size="small">
          <Select
            value={operator}
            onChange={handleOperatorChange}
            sx={{ fontSize: 13 }}
            MenuProps={{ sx: { maxHeight: 360 } }}
          >
            {operators.map((operatorDescriptor) => (
              <MenuItem
                key={operatorDescriptor.operator}
                value={operatorDescriptor.operator}
                sx={{ fontSize: 13 }}
              >
                {operatorDescriptor.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {bufferRequiresValue && (
          <Box sx={{ mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              type={filter.kind === "number" ? "number" : "text"}
              placeholder="Value"
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCommit) {
                  handleCommit();
                }
              }}
            />
            {filter.kind === "string" && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mt: 0.75,
                }}
              >
                <FontCaseRegularIcon
                  sx={{ fontSize: 12, fill: ({ palette }) => palette.gray[50] }}
                />
                <Typography
                  sx={{
                    fontSize: 11,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  Case-sensitive
                </Typography>
              </Box>
            )}
          </Box>
        )}
        <Box sx={{ mt: 1.5, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            size="xs"
            disabled={!canCommit}
            onClick={handleCommit}
          >
            {mode === "add" ? "Add" : "Save"}
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};
