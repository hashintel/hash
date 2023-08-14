import { extractVersion } from "@blockprotocol/graph";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  TYPE_SELECTOR_HEIGHT,
} from "@hashintel/design-system";
import { TypeCard } from "@hashintel/design-system/src/type-card";
import { Box, Stack } from "@mui/material";
import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../shared/form-types";
import { useIsReadonly } from "../shared/read-only-context";
import { TypeSelector } from "./shared/insert-property-field/type-selector";
import { Link } from "./shared/link";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";

export const InheritanceRow = () => {
  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);

  const selectorInputRef = useRef<HTMLInputElement>(null);
  const [typeSelectorSearchText, setTypeSelectorSearchText] = useState("");

  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();

  const chosenEntityTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const { entityTypes } = useEntityTypesOptions();
  const entityTypesArray = Object.values(entityTypes);
  const chosenEntityTypes = entityTypesArray.filter((type) =>
    chosenEntityTypeIds.includes(type.$id),
  );
  const entityTypeOptions = useFilterTypeOptions({
    typeOptions: entityTypesArray,
    typesToExclude: chosenEntityTypes,
  });

  const isReadonly = useIsReadonly();

  const setSelectorVisibility = (shouldBeVisible: boolean) => {
    if (shouldBeVisible) {
      setTypeSelectorOpen(true);
    } else {
      setTypeSelectorOpen(false);
      setTypeSelectorSearchText("");
    }
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{ height: TYPE_SELECTOR_HEIGHT }}
    >
      {chosenEntityTypes.length > 0 ? (
        chosenEntityTypes.map((type) => (
          <Box mr={2}>
            <TypeCard
              key={type.$id}
              LinkComponent={Link}
              title={type.title}
              url={type.$id}
              version={extractVersion(type.$id)}
            />
          </Box>
        ))
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
            variant: "entityType",
          }}
          inputRef={selectorInputRef}
          onAdd={(value) => {
            setValue("allOf", [...chosenEntityTypeIds, value.$id]);
            setTypeSelectorSearchText("");
            setTypeSelectorOpen(false);
          }}
          onCancel={() => setTypeSelectorOpen(false)}
          onSearchTextChange={setTypeSelectorSearchText}
          options={entityTypeOptions}
          searchText={typeSelectorSearchText}
          sx={{ width: 500 }}
          variant="entityType"
        />
      ) : (
        <Button
          onClick={() => setSelectorVisibility(!typeSelectorOpen)}
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
