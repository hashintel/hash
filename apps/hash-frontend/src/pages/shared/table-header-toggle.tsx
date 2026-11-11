import {
  Box,
  ToggleButton,
  toggleButtonClasses,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";

import type { ReactElement } from "react";

type TableHeaderToggleProps<Option extends string> = {
  options: {
    label: string;
    icon: ReactElement;
    value: Option;
  }[];
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
      aria-label="view"
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
          // A fixed square so every selected pill is 1:1.
          minWidth: 0,
          width: "26px",
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
      {options.map(({ icon, label, value: optionValue }) => (
        <ToggleButton
          key={optionValue}
          disableRipple
          value={optionValue}
          aria-label={label}
        >
          <Tooltip title={label} placement="top">
            <Box sx={{ lineHeight: 0 }}>{icon}</Box>
          </Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
