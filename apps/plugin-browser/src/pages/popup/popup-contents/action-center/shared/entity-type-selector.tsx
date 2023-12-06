import type { VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Chip, MenuItem } from "@hashintel/design-system";
import { BaseUrl, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { outlinedInputClasses, Typography } from "@mui/material";
import { useMemo } from "react";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../shared/style-values";
import { useEntityTypes } from "../../../../shared/use-entity-types";
import { menuItemSx } from "./autocomplete-sx";

type SelectTypesAndInferProps = {
  inputHeight: number;
  multiple: boolean;
  setTargetEntityTypeIds: (typeIds: VersionedUrl[]) => void;
  targetEntityTypeIds: VersionedUrl[] | null;
};

const menuWidth = 300;

export const EntityTypeSelector = ({
  inputHeight,
  multiple,
  setTargetEntityTypeIds,
  targetEntityTypeIds,
}: SelectTypesAndInferProps) => {
  const allEntityTypes = useEntityTypes();

  const selectedEntityTypes = useMemo(
    () =>
      allEntityTypes.filter(
        (type) =>
          targetEntityTypeIds?.some(
            (targetTypeId) => targetTypeId === type.schema.$id,
          ),
      ),
    [allEntityTypes, targetEntityTypeIds],
  );

  /**
   * In the dropdown, show the latest version of each type as an option,
   * and add the already-selected entity types (if not the latest – they may have been selected in an earlier session)
   */
  const optionsInDropdown = useMemo(() => {
    const latestEntityTypesByBaseUrl: Record<BaseUrl, EntityTypeWithMetadata> =
      {};

    for (const type of allEntityTypes) {
      const baseUrl = type.metadata.recordId.baseUrl;
      if (
        !selectedEntityTypes.some(
          (selectedType) => selectedType.schema.$id === type.schema.$id,
        ) &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false positive
        (!latestEntityTypesByBaseUrl[baseUrl] ||
          latestEntityTypesByBaseUrl[baseUrl].metadata.recordId.version <
            type.metadata.recordId.version)
      ) {
        latestEntityTypesByBaseUrl[baseUrl] = type;
      }
    }

    return [
      ...Object.values(latestEntityTypesByBaseUrl),
      ...selectedEntityTypes,
    ].sort((a, b) => a.schema.title.localeCompare(b.schema.title));
  }, [allEntityTypes, selectedEntityTypes]);

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
            width: menuWidth,
          },
        },
        popper: {
          placement: "top",
          sx: { "& div": { boxShadow: "none" } },
        },
      }}
      disableClearable
      getOptionLabel={(option) => option.schema.title}
      inputHeight={inputHeight}
      inputProps={{
        endAdornment: <div />,
        placeholder:
          selectedEntityTypes.length > 0 ? "" : "Search for types...",
        sx: () => ({
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
      isOptionEqualToValue={(option, value) =>
        option.schema.$id === value.schema.$id
      }
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
      multiple={multiple}
      onChange={(_event, value) => {
        setTargetEntityTypeIds(
          Array.isArray(value)
            ? value.map((type) => type.schema.$id)
            : [value.schema.$id],
        );
      }}
      options={optionsInDropdown}
      renderOption={(props, type) => (
        <MenuItem
          {...props}
          key={type.schema.$id}
          value={type.schema.$id}
          sx={menuItemSx}
        >
          <Typography
            sx={{
              fontSize: 14,
              "@media (prefers-color-scheme: dark)": {
                color: darkModeInputColor,
              },
            }}
          >
            {type.schema.title}
          </Typography>
        </MenuItem>
      )}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.schema.$id}
            variant="outlined"
            label={option.schema.title}
          />
        ))
      }
      value={multiple ? selectedEntityTypes : selectedEntityTypes[0] ?? null}
    />
  );
};
