import {
  Box,
  ToggleButton,
  toggleButtonClasses,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";

import type { ReactElement, ReactNode } from "react";

type TableHeaderToggleProps<Option extends string> = {
  options: {
    /** The option's accessible name */
    label: string;
    content: ReactNode;
    value: Option;
  }[];
  /** The accessible name of the group */
  label?: string;
  setValue: (value: Option) => void;
  value: Option;
};

/**
 * A segmented control: the options share one track and the selected option is
 * shown as a raised (pressed) white pill. Built on MUI's `ToggleButtonGroup` so
 * it stays in step with the surrounding MUI-styled toolbar.
 */
export const TableHeaderToggle = <Option extends string>({
  options,
  label: groupLabel = "view",
  setValue,
  value: selectedValue,
}: TableHeaderToggleProps<Option>) => {
  return (
    <ToggleButtonGroup
      value={selectedValue}
      exclusive
      onChange={(_, updatedValue) => {
        if (updatedValue) {
          setValue(updatedValue);
        }
      }}
      aria-label={groupLabel}
      size="small"
      sx={{
        gap: "3px",
        padding: "3px",
        borderRadius: "8px",
        backgroundColor: ({ palette }) => palette.gray[10],
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        [`.${toggleButtonClasses.root}`]: {
          // Override the grouped defaults (shared borders, collapsed radii) so
          // each option is an independent pill on the track.
          border: "0 !important",
          borderRadius: "6px !important",
          margin: "0 !important",
          // At least square, so an icon's selected pill is 1:1. Wider content,
          // such as a text label, sets its own width.
          minWidth: "26px",
          height: "26px",
          padding: 0,
          backgroundColor: "transparent",
          transition: ({ transitions }) =>
            transitions.create(["background-color", "box-shadow"]),
          svg: {
            transition: ({ transitions }) => transitions.create("color"),
            color: ({ palette }) => palette.gray[50],
          },
          "&:hover": {
            backgroundColor: "transparent",
            svg: {
              color: ({ palette }) => palette.gray[80],
            },
          },
          [`&.${toggleButtonClasses.selected}`]: {
            backgroundColor: ({ palette }) => palette.common.white,
            boxShadow: ({ boxShadows }) => boxShadows.sm,
            svg: {
              color: ({ palette }) => palette.gray[90],
            },
            "&:hover": {
              backgroundColor: ({ palette }) => palette.common.white,
            },
          },
        },
      }}
    >
      {options.map(({ content, label, value: optionValue }) => (
        <ToggleButton
          key={optionValue}
          disableRipple
          value={optionValue}
          aria-label={label}
        >
          {content}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};

/**
 * An icon option's content for `TableHeaderToggle`, with its label as a
 * tooltip.
 */
export const TableHeaderToggleIcon = ({
  icon,
  label,
}: {
  icon: ReactElement;
  label: string;
}) => (
  <Tooltip title={label} placement="top">
    <Box sx={{ lineHeight: 0 }}>{icon}</Box>
  </Tooltip>
);
