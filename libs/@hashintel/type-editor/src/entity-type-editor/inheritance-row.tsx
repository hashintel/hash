import { Button } from "@hashintel/design-system";
import { Box, Collapse, Stack } from "@mui/material";
import { bindTrigger } from "material-ui-popup-state/hooks";
import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../shared/form-types";
import { useIsReadonly } from "../shared/read-only-context";
import { TypeSelector } from "./shared/insert-property-field/type-selector";
import { InsertTypeField } from "./shared/insert-type-field";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";
import { withHandler } from "./shared/with-handler";

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
    /**
     * we pass the selected values to MUI, and can let it identify which are already selected
     * – it matches values to options by the provided 'isOptionEqualToValue' function
     */
    typesToExclude: [],
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
    <Stack direction="row">
      <Box>
        {chosenEntityTypes.map((type) => (
          <Box key={type.$id}>{type.title}</Box>
        ))}
      </Box>
      {!isReadonly && (
        <Button onClick={() => setSelectorVisibility(!typeSelectorOpen)}>
          {typeSelectorOpen ? "Cancel" : "Add"}
        </Button>
      )}
      <Collapse in={typeSelectorOpen} orientation="horizontal">
        <TypeSelector
          autoFocus
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
      </Collapse>
    </Stack>
  );
};
