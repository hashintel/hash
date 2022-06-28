import * as React from "react";
import { KeyboardArrowDown } from "@mui/icons-material";
import {
  AutocompleteProps as MuiAutocompleteProps,
  AutocompleteRenderInputParams,
  TextField,
  Autocomplete,
  outlinedInputClasses,
  autocompleteClasses,
} from "@mui/material";

type AutocompleteProps<T> = Omit<
  MuiAutocompleteProps<T, false, false, false>,
  "renderInput"
> & {
  label: string;
  placeholder: string;
  renderInput?: MuiAutocompleteProps<T, false, false, false>["renderInput"];
};

const CustomAutocomplete = <T,>(
  {
    label,
    placeholder,
    renderInput: customRenderInput,
    sx = [],
    ...props
  }: AutocompleteProps<T>,
  ref: React.Ref<HTMLDivElement>,
) => {
  const renderInput = (params: AutocompleteRenderInputParams) => {
    if (customRenderInput) {
      return customRenderInput(params);
    }

    return (
      <TextField
        {...params}
        label={label}
        placeholder={placeholder}
        InputLabelProps={{
          disableAnimation: true,
          shrink: true,
        }}
      />
    );
  };

  return (
    <Autocomplete
      ref={ref}
      fullWidth
      popupIcon={<KeyboardArrowDown />}
      sx={[
        ({ transitions }) => ({
          transition: transitions.create("opacity"),
          ...(props.disabled && { opacity: 0.3 }),

          [`.${outlinedInputClasses.root}`]: {
            pt: 0,
            pb: 0,
            height: 44,
          },

          [`.${autocompleteClasses.endAdornment}`]: {
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
          },

          [`.${outlinedInputClasses.notchedOutline}`]: {
            top: 0,
            legend: {
              display: "none",
            },
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      renderInput={renderInput}
      {...props}
    />
  );
};

// type assertion approach inspiration from https://stackoverflow.com/a/58473012
const CustomAutocompleteForwardRef = React.forwardRef(CustomAutocomplete) as <
  T extends {},
>(
  props: AutocompleteProps<T> & {
    ref?: React.Ref<HTMLDivElement>;
  },
) => React.ReactElement;

export { CustomAutocompleteForwardRef as CustomAutocomplete };
