import { Autocomplete } from "@hashintel/design-system";
import { outlinedInputClasses } from "@mui/material";

import { MenuItem } from "../../../../../shared/ui/menu-item";

export const SimpleAutocomplete = <
  T extends { disabled?: boolean; label: string; valueForSelector: string },
>({
  placeholder,
  options,
  setValue,
  value,
}: {
  placeholder: string;
  options: T[];
  setValue: (value: T | null) => void;
  value: T | null;
}) => {
  return (
    <Autocomplete<T, false, false, false>
      autoFocus={false}
      blurOnSelect
      componentsProps={{
        paper: {
          sx: {
            p: 0,
            maxWidth: 600,
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
      getOptionDisabled={(option) => !!option.disabled}
      inputHeight="auto"
      inputProps={{
        endAdornment: <div />,
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
      disableCloseOnSelect
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
          }}
          value={option.valueForSelector}
        >
          {option.label}
        </MenuItem>
      )}
      value={value}
    />
  );
};
