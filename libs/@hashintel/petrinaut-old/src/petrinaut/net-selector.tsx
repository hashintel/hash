import { Autocomplete, CaretDownSolidIcon } from "@hashintel/design-system";
import { MenuItem, outlinedInputClasses } from "@mui/material";
import { useMemo, useRef } from "react";

import type { MinimalNetMetadata } from "./types";

export const NetSelector = ({
  disabledOptions,
  onSelect,
  options,
  placeholder,
  value,
}: {
  disabledOptions?: string[];
  onSelect: (option: MinimalNetMetadata) => void;
  options: MinimalNetMetadata[];
  placeholder?: string;
  value: string | null;
}) => {
  const selectedOption = useMemo(() => {
    return options.find((option) => option.netId === value);
  }, [options, value]);

  const inputRef = useRef<HTMLInputElement>(null);

  if (options.length === 0) {
    return null;
  }

  return (
    <Autocomplete<MinimalNetMetadata | null, false, false, false>
      autoFocus={false}
      componentsProps={{
        paper: {
          sx: {
            p: 0,
            maxWidth: "90vw",
            minWidth: "100%",
            width: "fit-content",
          },
        },
      }}
      disableCloseOnSelect={false}
      disabled={options.length === 0}
      getOptionDisabled={(option) =>
        !!option && !!disabledOptions?.includes(option.netId)
      }
      getOptionLabel={(option) => option?.title ?? ""}
      inputHeight={40}
      inputProps={{
        endAdornment: <CaretDownSolidIcon sx={{ fontSize: 14 }} />,
        placeholder: placeholder ?? "Select a net to load",
        sx: () => ({
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
        option?.netId === selectedValue?.netId
      }
      renderOption={(props, data) => (
        <MenuItem {...props} key={data?.netId}>
          {data?.title ?? ""}
        </MenuItem>
      )}
      ListboxProps={{
        sx: {
          maxHeight: 240,
        },
      }}
      onChange={(_event, option) => {
        if (!option) {
          return;
        }

        onSelect(option);
        inputRef.current?.blur();
      }}
      options={options}
      sx={{ maxWidth: 300 }}
      value={selectedOption}
    />
  );
};
