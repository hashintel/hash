import type { EntityType, PropertyType } from "@blockprotocol/graph";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";
import { useFieldArray, useFormContext } from "react-hook-form";

import { FilterRow } from "./query-form/filter-row";
import { useReadonlyContext } from "./readonly-context";
import type { FormValues } from "./types";

interface QueryFormProps {
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
}

export const QueryForm = ({ entityTypes, propertyTypes }: QueryFormProps) => {
  const readonly = useReadonlyContext();
  const form = useFormContext<FormValues>();

  const fieldArray = useFieldArray({
    control: form.control,
    name: "filters",
    rules: {
      required: { value: true, message: "Min. 1 condition is required" },
    },
  });

  const handleAddCondition = () => {
    fieldArray.append({
      type: "Type",
      operator: "is",
      value: "",
    });
  };

  const filtersError = form.formState.errors.filters?.root?.message;

  return (
    <>
      {!!fieldArray.fields.length && (
        <Stack gap={3} sx={{ alignSelf: "flex-start", maxWidth: "100%" }}>
          {fieldArray.fields.map((field, index) => (
            <FilterRow
              index={index}
              key={field.id}
              onRemove={() => fieldArray.remove(index)}
              entityTypes={entityTypes}
              propertyTypes={propertyTypes}
            />
          ))}
        </Stack>
      )}

      {!readonly && (
        <Box>
          <Button
            onClick={handleAddCondition}
            variant="tertiary_quiet"
            size="xs"
            startIcon={
              <FontAwesomeIcon
                icon={faPlus}
                sx={{ color: ({ palette }) => palette.gray[80] }}
              />
            }
            sx={{
              color: ({ palette }) => palette.gray[80],
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            ADD CONDITION
          </Button>
        </Box>
      )}

      {!!filtersError && (
        <Typography sx={{ color: ({ palette }) => palette.red[70] }}>
          {filtersError}
        </Typography>
      )}
    </>
  );
};
