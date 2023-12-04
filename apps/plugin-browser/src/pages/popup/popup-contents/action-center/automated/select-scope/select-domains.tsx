import { Autocomplete, Chip, MenuItem } from "@hashintel/design-system";
import {
  autocompleteClasses,
  outlinedInputClasses,
  Typography,
} from "@mui/material";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../../shared/style-values";

export const SelectDomains = ({
  options,
  selectedDomains,
  setSelectedDomains,
}: {
  options: string[];
  selectedDomains: string[] | null;
  setSelectedDomains: (domains: string[] | null) => void;
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
      freeSolo
      inputProps={{
        endAdornment: <div />,
        placeholder: "Search for types...",
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
          Array.isArray(value) ? value : [...(selectedDomains ?? []), value],
        );
      }}
      options={options}
      renderOption={(props, domain) => (
        <MenuItem
          {...props}
          key={domain}
          value={domain}
          sx={({ palette }) => ({
            minHeight: 0,
            borderBottom: `1px solid ${palette.gray[20]}`,
            "@media (prefers-color-scheme: dark)": {
              borderBottom: `1px solid ${darkModeBorderColor}`,

              "&:hover": {
                background: darkModeInputBackgroundColor,
              },

              [`&.${autocompleteClasses.option}`]: {
                borderRadius: 0,
                my: 0.25,

                [`&[aria-selected="true"]`]: {
                  backgroundColor: `${palette.primary.main} !important`,
                  color: palette.common.white,
                },

                "&.Mui-focused": {
                  backgroundColor: `${palette.common.black} !important`,

                  [`&[aria-selected="true"]`]: {
                    backgroundColor: `${palette.primary.main} !important`,
                  },
                },
              },
            },
          })}
        >
          <Typography
            sx={{
              fontSize: 14,
              "@media (prefers-color-scheme: dark)": {
                color: darkModeInputColor,
              },
            }}
          >
            {domain}
          </Typography>
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
      value={selectedDomains ?? []}
    />
  );
};
