import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  TYPE_SELECTOR_HEIGHT,
} from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../shared/form-types";
import { useIsReadonly } from "../shared/read-only-context";
import { InheritedTypeCard } from "./inheritance-row/inherited-type-card";
import { useValidateParents } from "./inheritance-row/use-validate-parents";
import { TypeSelector } from "./shared/insert-property-field/type-selector";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";

export const InheritanceRow = ({
  entityTypeId,
}: {
  entityTypeId: VersionedUrl;
}) => {
  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);

  const selectorInputRef = useRef<HTMLInputElement>(null);
  const [typeSelectorSearchText, setTypeSelectorSearchText] = useState("");

  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();

  const directParentEntityTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const properties = useWatch({
    control,
    name: "properties",
  });

  const links = useWatch({
    control,
    name: "links",
  });

  const { entityTypes, linkTypes } = useEntityTypesOptions();

  const { entityTypesArray, directParents } = useMemo(() => {
    const typesArray = [
      ...Object.values(entityTypes),
      ...Object.values(linkTypes),
    ];

    const parents = typesArray.filter((type) =>
      directParentEntityTypeIds.includes(type.$id),
    );

    return { entityTypesArray: typesArray, directParents: parents };
  }, [entityTypes, linkTypes, directParentEntityTypeIds]);

  const entityTypeOptions = useFilterTypeOptions({
    typeOptions: entityTypesArray,
    typesToExclude: directParents,
  });

  const isReadonly = useIsReadonly();

  const validateParents = useValidateParents();

  const setSelectorVisibility = (shouldBeVisible: boolean) => {
    if (shouldBeVisible) {
      setTypeSelectorOpen(true);
    } else {
      setTypeSelectorOpen(false);
      setTypeSelectorSearchText("");
    }
  };

  const addParent = (parent: EntityType) => {
    const proposedParentIds = [...directParentEntityTypeIds, parent.$id];

    validateParents({
      childEntityTypeId: entityTypeId,
      childLinksIds: links.map((link) => link.$id),
      childPropertiesIds: properties.map((property) => property.$id),
      directParentIds: proposedParentIds,
    });

    setValue("allOf", proposedParentIds, {
      shouldDirty: true,
    });
    setSelectorVisibility(false);
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{ height: TYPE_SELECTOR_HEIGHT }}
    >
      {directParents.length > 0 ? (
        directParents.map((type) => {
          return (
            <Box key={type.$id} sx={{ mr: 2 }}>
              <InheritedTypeCard entityType={type} />
            </Box>
          );
        })
      ) : (
        <Box
          sx={({ palette }) => ({
            background: palette.gray[20],
            border: `1px solid ${palette.gray[30]}`,
            borderRadius: 1.5,
            color: palette.gray[80],
            fontSize: "var(--step--1)",
            px: 2,
            py: 1,
            mr: 2,
          })}
        >
          No other types yet
        </Box>
      )}
      {isReadonly ? null : typeSelectorOpen ? (
        <TypeSelector
          dropdownProps={{
            query: typeSelectorSearchText,
            createButtonProps: null,
            variant: "entity type",
          }}
          inputRef={selectorInputRef}
          onAdd={addParent}
          onCancel={() => setSelectorVisibility(false)}
          onSearchTextChange={setTypeSelectorSearchText}
          options={entityTypeOptions}
          searchText={typeSelectorSearchText}
          sx={{ width: 500 }}
          variant="entity type"
        />
      ) : (
        <Button
          onClick={() => setSelectorVisibility(true)}
          size="xs"
          variant="secondary_quiet"
        >
          ADD TYPE{" "}
          <FontAwesomeIcon
            icon={faPlus}
            sx={{
              display: "flex",
              alignItems: "center",
              fontSize: "var(--step--3)",
              ml: 0.7,
              mb: 0.1,
            }}
          />
        </Button>
      )}
    </Stack>
  );
};
