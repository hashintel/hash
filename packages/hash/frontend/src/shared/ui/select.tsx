import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  BoxProps,
  Collapse,
  FormHelperText,
  InputLabel,
  outlinedInputClasses,
  // eslint-disable-next-line no-restricted-imports
  Select as MuiSelect,
  SelectProps as MuiSelectProps,
  Typography,
} from "@mui/material";
import { forwardRef, ReactNode, ForwardRefRenderFunction } from "react";
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

/**
 * @todo add custom class for component so it's easier to target the component using css
 */

/**
 * For some reasons, renderValue prop doesn't properly infer types
 * when we use this wrapper Select component. But works properly
 * when the default Select component from MUI is used
 * Has to do with properly handling the generic.
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Select/Select.d.ts
 * @todo fix this
 */

const Select: ForwardRefRenderFunction<HTMLSelectElement, SelectProps> = (
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

const SelectForwardRef = forwardRef(Select);

export { SelectForwardRef as Select };
