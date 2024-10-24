import { Autocomplete } from "@hashintel/design-system";
import { outlinedInputClasses } from "@mui/material";
import type { ReactNode, RefObject } from "react";

import { MenuItem } from "../../../../../shared/ui/menu-item";

export const SimpleAutocomplete = <
  T extends {
    disabled?: boolean;
    label: string;
    valueForSelector: string;
  } & { [key: string]: string | number | boolean | string[] },
>({
  autoFocus,
  endAdornment,
  inputRef,
  placeholder,
  options,
  setValue,
  sortAlphabetically = true,
  suffixKey,
  value,
}: {
  autoFocus?: boolean;
  endAdornment?: ReactNode;
  inputRef?: RefObject<HTMLDivElement>;
  placeholder: string;
  options: T[];
  sortAlphabetically?: boolean;
  suffixKey?: keyof T;
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
      options={
        sortAlphabetically
          ? options.sort((a, b) => a.label.localeCompare(b.label))
          : options
      }
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
            (suffixKey && option[suffixKey] ? ` ${option[suffixKey]}` : "")}
        </MenuItem>
      )}
      value={value}
    />
  );
};
