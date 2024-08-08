import type {
  EntityTypeReference,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { Autocomplete, Chip, MenuItem } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { PopperProps } from "@mui/material";
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
  inputHeight: number | string;
  multiple: boolean;
  popperPlacement?: PopperProps["placement"];
  setTargetEntityTypeIds: (params: {
    selectedEntityTypeIds: VersionedUrl[];
    linkedEntityTypeIds: VersionedUrl[];
  }) => void;
  targetEntityTypeIds: VersionedUrl[] | null;
};

const menuWidth = 400;

export const EntityTypeSelector = ({
  inputHeight,
  multiple,
  popperPlacement,
  setTargetEntityTypeIds,
  targetEntityTypeIds,
}: SelectTypesAndInferProps) => {
  const { entityTypes: allEntityTypes } = useEntityTypes();

  const selectedEntityTypes = useMemo(
    () =>
      allEntityTypes.filter((type) =>
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

  const getLinkedEntityTypeIds = (entityTypes: EntityTypeWithMetadata[]) => {
    const linkedEntityTypeIds: Set<VersionedUrl> = new Set();

    /**
     * We only want to add linked types for newly added entity types,
     * because otherwise users may remove a linked type, make another unrelated change
     * and have the linked type added back in (because another selected type links to it).
     *
     * This also means that if a user explicitly removes a linked type, this function does nothing.
     */
    const addedEntityTypes = entityTypes.filter(
      (type) =>
        !selectedEntityTypes.some(
          (selectedType) => selectedType.schema.$id === type.schema.$id,
        ),
    );

    for (const type of addedEntityTypes) {
      for (const [linkEntityTypeId, linkConstraints] of typedEntries(
        type.schema.links ?? {},
      )) {
        linkedEntityTypeIds.add(linkEntityTypeId);

        const destinationEntityTypeRefs: EntityTypeReference[] =
          "oneOf" in linkConstraints.items ? linkConstraints.items.oneOf : [];

        // Add the target entity types
        for (const destinationEntityTypeRef of destinationEntityTypeRefs) {
          linkedEntityTypeIds.add(destinationEntityTypeRef.$ref);
        }
      }
    }

    return [...linkedEntityTypeIds];
  };

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
          placement: popperPlacement ?? "top",
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
        const newTargetEntityTypes = Array.isArray(value) ? value : [value];

        const linkedEntityTypeIds =
          getLinkedEntityTypeIds(newTargetEntityTypes);

        setTargetEntityTypeIds({
          selectedEntityTypeIds: newTargetEntityTypes.map(
            (type) => type.schema.$id,
          ),
          linkedEntityTypeIds,
        });
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
              pl: 1,
            }}
          >
            {type.schema.title}
          </Typography>
          <Chip
            color="blue"
            label={getChipLabelFromId(type.schema.$id)}
            sx={{ ml: 1, fontSize: 13, p: 0 }}
          />
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
      value={
        multiple
          ? selectedEntityTypes
          : (selectedEntityTypes[0] ?? (null as unknown as undefined))
      }
    />
  );
};
