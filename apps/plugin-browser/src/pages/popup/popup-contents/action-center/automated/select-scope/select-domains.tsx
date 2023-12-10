import { Autocomplete, Chip, MenuItem } from "@hashintel/design-system";
import { createFilterOptions, outlinedInputClasses } from "@mui/material";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../../shared/style-values";
import { menuItemSx } from "../../shared/autocomplete-sx";

const filter = createFilterOptions<string>();

export const SelectDomains = ({
  options,
  selectedDomains,
  setSelectedDomains,
}: {
  options: string[];
  selectedDomains: string[];
  setSelectedDomains: (domains: string[]) => void;
}) => {
  return (
    <Autocomplete
      autoFocus={false}
      componentsProps={{
        paper: {
          sx: {
            p: 0,
            "@media (prefers-color-scheme: dark)": {
              background: darkModeInputBackgroundColor,
              borderColor: darkModeBorderColor,
            },
          },
        },
        popper: { placement: "top" },
      }}
      filterOptions={(allOptions, params) => {
        const filtered = filter(allOptions, params);

        const { inputValue } = params;
        const isExisting = allOptions.some((option) =>
          option.includes(inputValue),
        );

        if (inputValue !== "" && !isExisting) {
          // Show an option to the user making clear the new value can be added (also works by hitting enter)
          filtered.push(inputValue);
        }
        return filtered;
      }}
      freeSolo
      inputHeight="auto"
      inputProps={{
        endAdornment: <div />,
        placeholder: selectedDomains.length > 0 ? "" : "On any site",
        sx: () => ({
          height: "auto",
          [`&.${outlinedInputClasses.root}`]: {
            py: 0.3,
            px: 1,
          },

          "@media (prefers-color-scheme: dark)": {
            background: darkModeInputBackgroundColor,

            [`.${outlinedInputClasses.notchedOutline}`]: {
              border: `1px solid ${darkModeBorderColor} !important`,
            },

            [`.${outlinedInputClasses.input}`]: {
              color: darkModeInputColor,

              "&::placeholder": {
                color: `${darkModePlaceholderColor} !important`,
              },
            },
          },
        }),
      }}
      ListboxProps={{
        sx: {
          maxHeight: 240,
        },
      }}
      modifiers={[
        {
          name: "flip",
          enabled: false,
        },
      ]}
      multiple
      onChange={(_event, value) => {
        setSelectedDomains(
          Array.isArray(value) ? value : [...selectedDomains, value],
        );
      }}
      options={options}
      renderOption={(props, domain) => (
        <MenuItem {...props} key={domain} value={domain} sx={menuItemSx}>
          <Chip color="blue" label={domain} sx={{ ml: 1, fontSize: 13 }} />
        </MenuItem>
      )}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option}
            variant="outlined"
            label={option}
          />
        ))
      }
      value={selectedDomains}
    />
  );
};
