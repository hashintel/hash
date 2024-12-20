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
        [`.${toggleButtonClasses.root}`]: {
          backgroundColor: ({ palette }) => palette.common.white,
          "&:not(:last-of-type)": {
            borderRightColor: ({ palette }) => palette.gray[20],
            borderRightStyle: "solid",
            borderRightWidth: 2,
          },
          "&:hover": {
            backgroundColor: ({ palette }) => palette.common.white,
            svg: {
              color: ({ palette }) => palette.gray[80],
            },
          },
          [`&.${toggleButtonClasses.selected}`]: {
            backgroundColor: ({ palette }) => palette.common.white,
            svg: {
              color: ({ palette }) => palette.gray[90],
            },
          },
          svg: {
            transition: ({ transitions }) => transitions.create("color"),
            color: ({ palette }) => palette.gray[50],
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
