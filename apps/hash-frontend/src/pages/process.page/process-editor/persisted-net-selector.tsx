import type { EntityId } from "@blockprotocol/type-system";
import { Autocomplete, CaretDownSolidIcon } from "@hashintel/design-system";
import { outlinedInputClasses } from "@mui/material";
import { useMemo, useRef } from "react";

import { MenuItem } from "../../../shared/ui";
import type { PersistedNet } from "./types";

export const PersistedNetSelector = ({
  disabledOptions,
  onSelect,
  options,
  placeholder,
  value,
}: {
  disabledOptions?: EntityId[];
  onSelect: (option: PersistedNet) => void;
  options: PersistedNet[];
  placeholder?: string;
  value: EntityId | null;
}) => {
  const selectedOption = useMemo(() => {
    return options.find((option) => option.entityId === value);
  }, [options, value]);

  const inputRef = useRef<HTMLInputElement>(null);

  if (options.length === 0) {
    return null;
  }

  return (
    <Autocomplete<PersistedNet | null, false, false, false>
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
        !!option && !!disabledOptions?.includes(option.entityId)
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
        option?.entityId === selectedValue?.entityId
      }
      renderOption={(props, data) => (
        <MenuItem {...props}>{data?.title ?? ""}</MenuItem>
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
