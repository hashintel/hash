import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";

import { FormValues, QueryFormProps } from "../../types";
import {
  mapFormValuesToMultiFilter,
  mapMultiFilterToFormValues,
} from "../utils";
import { FilterRow } from "./filter-row/filter-row";

export const QueryForm = ({
  onDiscard,
  onSave,
  entityTypes,
  propertyTypes,
  defaultValue,
}: QueryFormProps) => {
  const form = useForm<FormValues>({
    defaultValues: defaultValue
      ? mapMultiFilterToFormValues(defaultValue)
      : { operator: "AND", filters: [] },
  });

  const fieldArray = useFieldArray({ control: form.control, name: "filters" });

  const handleAddCondition = () => {
    fieldArray.append({
      type: "Type",
      operator: "is",
      value: "",
    });
  };

  const onSubmit = (data: FormValues) => {
    onSave(mapFormValuesToMultiFilter(data));
  };

  return (
    <FormProvider {...form}>
      <>
        <Stack gap={3} sx={{ alignSelf: "flex-start", mb: 2.5 }}>
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

        <Stack direction="row" gap={1}>
          <Button onClick={form.handleSubmit(onSubmit)}>
            Save and preview query
          </Button>
          <Button variant="tertiary" onClick={onDiscard}>
            Discard query
          </Button>
        </Stack>
      </>
    </FormProvider>
  );
};
