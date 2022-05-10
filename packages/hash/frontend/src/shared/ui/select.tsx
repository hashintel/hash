import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  BoxProps,
  Collapse,
  InputLabel,
  outlinedInputClasses,
  Select as MuiSelect,
  SelectProps as MuiSelectProps,
  Typography,
} from "@mui/material";
import { FC, forwardRef, ReactNode } from "react";
import { FontAwesomeIcon } from "../icons";

export type SelectProps = {
  children: ReactNode;
  error?: boolean;
  helperText?: ReactNode;
  sx?: BoxProps["sx"];
  selectSx?: MuiSelectProps["sx"];
} & Omit<MuiSelectProps, "sx">;

// @todo add custom class for component so it's easier to target the
// component using css

// For some reasons, renderValue prop doesn't properly infer types
// when we use this wrapper Select component. But works properly
// when the default Select component from MUI is used
// see select-with-search-checkbox.tsx in playground.page
// @todo figure out why this happens and fix

// @todo

export const Select: FC<SelectProps> = forwardRef(
  (
    { children, sx = [], selectSx = [], error, helperText, label, ...props },
    ref,
  ) => {
    return (
      <Box sx={sx}>
        {label && (
          <InputLabel {...(props.labelId && { id: props.labelId })}>
            {label}
          </InputLabel>
        )}
        <MuiSelect
          fullWidth
          sx={[
            ({ palette }) => ({
              ...(error && {
                [`.${outlinedInputClasses.notchedOutline}`]: {
                  borderColor: `${palette.orange[50]} !important`,
                },
              }),
            }),
            ...(Array.isArray(selectSx) ? selectSx : [selectSx]),
          ]}
          {...props}
          ref={ref}
        >
          {children}
        </MuiSelect>
        <Collapse in={!!helperText}>
          <Box display="flex" alignItems="center" mt={1}>
            <FontAwesomeIcon
              sx={({ palette }) => ({
                mr: 1,
                color: palette.orange[50],
              })}
              icon={faCircleExclamation}
            />
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                color: palette.orange[80],
              })}
            >
              {helperText}
            </Typography>
          </Box>
        </Collapse>
      </Box>
    );
  },
);

Select.displayName = "Select";
