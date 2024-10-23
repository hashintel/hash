import { Autocomplete } from "@hashintel/design-system";
import { outlinedInputClasses } from "@mui/material";
import type { ReactNode, RefObject } from "react";

import { MenuItem } from "../../../../../shared/ui/menu-item";

export const SimpleAutocomplete = <
  T extends {
    disabled?: boolean;
    label: string;
    suffix?: string;
    valueForSelector: string;
  },
>({
  autoFocus,
  endAdornment,
  includeSuffix,
  inputRef,
  placeholder,
  options,
  setValue,
  value,
}: {
  autoFocus?: boolean;
  endAdornment?: ReactNode;
  includeSuffix?: boolean;
  inputRef?: RefObject<HTMLDivElement>;
  placeholder: string;
  options: T[];
  setValue: (value: T | null) => void;
  value: T | null;
}) => {
  return (
    <Autocomplete<T, false, false, false>
      autoFocus={!!autoFocus}
      componentsProps={{
        paper: {
          sx: {
            p: 0,
            maxWidth: "90vw",
            minWidth: "100%",
            width: "fit-content",
          },
        },
        popper: {
          sx: {
            "& > div:first-child": {
              boxShadow: "none",
            },
          },
        },
      }}
      disabled={options.length === 0}
      getOptionDisabled={(option) => !!option.disabled}
      inputHeight="auto"
      inputProps={{
        endAdornment: endAdornment ?? <div />,
        placeholder,
        sx: () => ({
          height: "auto",
          [`&.${outlinedInputClasses.root}`]: {
            py: 0.3,
            px: "8px !important",

            input: {
              fontSize: 14,
            },
          },
        }),
      }}
      inputRef={inputRef}
      isOptionEqualToValue={(option, selectedValue) =>
        option.valueForSelector === selectedValue.valueForSelector
      }
      ListboxProps={{
        sx: {
          maxHeight: 240,
        },
      }}
      onChange={(_event, option) => {
        setValue(option);
      }}
      options={options.sort((a, b) => a.label.localeCompare(b.label))}
      renderOption={(props, option) => (
        <MenuItem
          {...props}
          key={option.valueForSelector}
          sx={{
            "&:active": {
              color: "inherit",
            },
            boxShadow: "none !important",
          }}
          value={option.valueForSelector}
        >
          {option.label +
            (includeSuffix && option.suffix ? ` ${option.suffix}` : "")}
        </MenuItem>
      )}
      value={value}
    />
  );
};
