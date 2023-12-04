import type { VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Chip, MenuItem } from "@hashintel/design-system";
import { BaseUrl, EntityTypeWithMetadata } from "@local/hash-subgraph";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../../shared/style-values";
import { useEntityTypes } from "../../../../../shared/use-entity-types";

// This assumes a VersionedURL in the hash.ai/blockprotocol.org format
const getChipLabelFromId = (id: VersionedUrl) => {
  const url = new URL(id);
  const [_emptyString, namespace, _types, _entityType, typeSlug] =
    url.pathname.split("/");

  return `${
    url.origin !== FRONTEND_ORIGIN ? `${url.host} / ` : ""
  }${namespace} / ${typeSlug}`;
};

type SelectTypesAndInferProps = {
  multiple: boolean;
  setTargetEntityTypeIds: (typeIds: VersionedUrl[]) => void;
  targetEntityTypeIds: VersionedUrl[] | null;
};

export const EntityTypeSelector = ({
  multiple,
  setTargetEntityTypeIds,
  targetEntityTypeIds,
}: SelectTypesAndInferProps) => {
  const allEntityTypes = useEntityTypes();

  const [selectOpen, setSelectOpen] = useState(false);

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
          },
        },
        popper: { placement: "top" },
      }}
      disableClearable
      getOptionLabel={(option) => option.schema.title}
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
      open={selectOpen}
      onChange={(_event, value) => {
        setTargetEntityTypeIds(
          Array.isArray(value)
            ? value.map((type) => type.schema.$id)
            : [value.schema.$id],
        );
        setSelectOpen(false);
      }}
      onClose={() => setSelectOpen(false)}
      onOpen={() => setSelectOpen(true)}
      options={optionsInDropdown}
      renderOption={(props, type) => (
        <MenuItem
          {...props}
          key={type.schema.$id}
          value={type.schema.$id}
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
      value={multiple ? selectedEntityTypes : selectedEntityTypes[0]}
    />
  );
};
