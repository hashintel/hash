import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  BoxProps,
  Collapse,
  FormHelperText,
  InputLabel,
  outlinedInputClasses,
  Select as MuiSelect,
  SelectProps as MuiSelectProps,
  Typography,
} from "@mui/material";
import { forwardRef, ReactElement, ReactNode, Ref } from "react";

import { FontAwesomeIcon } from "./fontawesome-icon";

export type SelectProps<T = unknown> = {
  children: ReactNode;
  error?: boolean;
  helperText?: ReactNode;
  sx?: BoxProps["sx"];
  selectSx?: MuiSelectProps["sx"];
} & Omit<MuiSelectProps<T>, "sx">;

/**
 * @todo add custom class for component so it's easier to target the component using css
 */

const Select = <T,>(
  {
    children,
    sx = [],
    selectSx = [],
    error,
    helperText,
    label,
    ...props
  }: SelectProps<T>,
  ref: Ref<HTMLSelectElement>,
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
        <FormHelperText
          error
          sx={{ display: "flex", alignItems: "center", mt: 1 }}
        >
          <FontAwesomeIcon icon={faCircleExclamation} />
          <Typography variant="smallTextLabels">{helperText}</Typography>
        </FormHelperText>
      </Collapse>
    </Box>
  );
};

// used the type assertion approach in https://stackoverflow.com/a/58473012
const SelectForwardRef = forwardRef(Select) as <T extends {}>(
  p: SelectProps<T> & { ref?: Ref<HTMLSelectElement> },
) => ReactElement;

export { SelectForwardRef as Select };
