import { EntityType, MultiFilter, PropertyType } from "@blockprotocol/graph";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";

import { FilterRow } from "./query-form/filter-row";
import {
  mapFormValuesToMultiFilter,
  mapMultiFilterToFormValues,
} from "./query-form/filter-row/utils";
import { useReadonlyContext } from "./readonly-context";
import { FormValues } from "./types";

interface QueryFormProps {
  onSave: (value: MultiFilter) => void;
  onPreview: (value: MultiFilter) => void;
  onDiscard: () => void;
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
  defaultValue?: MultiFilter;
}

export const QueryForm = ({
  onDiscard,
  onSave,
  onPreview,
  entityTypes,
  propertyTypes,
  defaultValue,
}: QueryFormProps) => {
  const readonly = useReadonlyContext();
  const form = useForm<FormValues>({
    defaultValues: defaultValue
      ? mapMultiFilterToFormValues(defaultValue)
      : { operator: "AND", filters: [] },
  });

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

  const onSubmitPreview = (data: FormValues) => {
    onPreview(mapFormValuesToMultiFilter(data));
  };

  const onSubmitSave = (data: FormValues) => {
    onSave(mapFormValuesToMultiFilter(data));
  };

  const filtersError = form.formState.errors.filters?.root?.message;

  return (
    <FormProvider {...form}>
      <>
        {!!fieldArray.fields.length && (
          <Stack gap={3} sx={{ alignSelf: "flex-start" }}>
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

        <Stack direction="row" gap={1}>
          <Button onClick={form.handleSubmit(onSubmitPreview)}>
            Preview query
          </Button>
          {!readonly && (
            <Button
              onClick={form.handleSubmit(onSubmitSave)}
              sx={{ backgroundColor: ({ palette }) => palette.gray[80] }}
            >
              Save query
            </Button>
          )}
          {!readonly && (
            <Button variant="tertiary" onClick={onDiscard}>
              Discard query
            </Button>
          )}
        </Stack>
      </>
    </FormProvider>
  );
};
