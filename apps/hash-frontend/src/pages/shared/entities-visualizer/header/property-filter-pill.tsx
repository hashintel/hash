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
  Select,
  TextField,
  XMarkRegularIcon,
} from "@hashintel/design-system";

import { CheckRegularIcon } from "../../../../shared/icons/check-regular-icon";
import { FontCaseRegularIcon } from "../../../../shared/icons/font-case-regular-icon";
import { HashtagRegularIcon } from "../../../../shared/icons/hashtag-regular-icon";
import { Button, MenuItem } from "../../../../shared/ui";
import { isPropertyFilterActive } from "../data/property-filters/build-property-filter-clause";
import {
  getOperatorDescriptor,
  getOperatorsForKind,
} from "../data/property-filters/get-operators-for-kind";
import { activePillSx, incompletePillSx } from "./pill-styles";

import type {
  FilterValueKind,
  PropertyFilter,
  PropertyFilterOperator,
} from "../data/property-filters/types";
import type { SelectChangeEvent, SvgIconProps } from "@mui/material";
import type { ComponentType, FunctionComponent } from "react";

const VALUE_DEBOUNCE_MS = 350;

const kindIcon: Record<FilterValueKind, ComponentType<SvgIconProps>> = {
  number: HashtagRegularIcon,
  string: FontCaseRegularIcon,
  boolean: CheckRegularIcon,
};

type PropertyFilterPillProps = {
  filter: PropertyFilter;
  /** Whether to open the editor automatically (just-added pill). */
  autoOpen: boolean;
  onAutoOpenHandled: () => void;
  onChange: (updater: (prev: PropertyFilter) => PropertyFilter) => void;
  onRemove: () => void;
};

export const PropertyFilterPill: FunctionComponent<PropertyFilterPillProps> = ({
  filter,
  autoOpen,
  onAutoOpenHandled,
  onChange,
  onRemove,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: `entities-visualizer-property-filter-${filter.id}`,
  });

  const anchorRef = useRef<HTMLDivElement>(null);

  const operators = getOperatorsForKind(filter.kind);
  const descriptor = getOperatorDescriptor(filter.kind, filter.operator);
  const requiresValue = descriptor?.requiresValue ?? false;
  const connector = descriptor?.pillConnector ?? "";

  /**
   * Value typing is debounced before it reaches the shared filter state, so the
   * list doesn't refetch on every keystroke. Operator changes and removal apply
   * immediately.
   */
  const [valueDraft, setValueDraft] = useState(filter.value ?? "");

  /**
   * Latest-value refs so the debounce effect only depends on `valueDraft`. The
   * parent re-creates `onChange` on every render, and `filter.value` changes
   * when the debounce commits; depending on either would reset the timer on
   * unrelated re-renders and break the debounce.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const committedValueRef = useRef(filter.value);
  committedValueRef.current = filter.value;

  useEffect(() => {
    const timeout = setTimeout(() => {
      if ((committedValueRef.current ?? "") !== valueDraft) {
        onChangeRef.current((prev) => ({ ...prev, value: valueDraft }));
      }
    }, VALUE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [valueDraft]);

  useEffect(() => {
    if (autoOpen && anchorRef.current) {
      popupState.open(anchorRef.current);
      onAutoOpenHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to autoOpen flipping on
  }, [autoOpen]);

  const handleOperatorChange = (event: SelectChangeEvent) => {
    const nextOperator = event.target.value as PropertyFilterOperator;
    onChange((prev) => ({ ...prev, operator: nextOperator }));
  };

  const active = isPropertyFilterActive(filter);

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
    <Box ref={anchorRef} sx={{ display: "inline-flex" }}>
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
          </Box>
        }
        sx={active ? activePillSx : incompletePillSx}
        {...bindTrigger(popupState)}
      />
      <Popover
        {...bindPopover(popupState)}
        anchorOrigin={{ vertical: 36, horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 260, p: 1.5 } } }}
      >
        <FormControl fullWidth size="small">
          <Select
            value={filter.operator}
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
        {requiresValue && (
          <Box sx={{ mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              type={filter.kind === "number" ? "number" : "text"}
              placeholder="Value"
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
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
            variant="tertiary_quiet"
            size="xs"
            startIcon={<XMarkRegularIcon />}
            onClick={() => {
              onRemove();
              popupState.close();
            }}
            sx={{ background: "transparent" }}
          >
            Remove
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};
