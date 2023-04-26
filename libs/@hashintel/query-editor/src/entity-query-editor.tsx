import { MultiFilter } from "@blockprotocol/graph";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";

import { FilterRow } from "./filter-row/filter-row";
import { EditorTitle } from "./title";
import { EntityQueryEditorProps, FormValues, PropertyFilter } from "./types";

/** @todo confirm this function with backend */
const mapFormValuesToMultiFilter = (data: FormValues): MultiFilter => {
  const filters: MultiFilter["filters"] = [];

  for (const filter of data.filters) {
    if (filter.type === "Type") {
      filters.push({
        operator: "EQUALS",
        value: filter.value,
        field: ["metadata", "entityTypeId"],
      });
    } else {
      const field = ["properties", filter.propertyTypeBaseUrl];

      switch (filter.operator) {
        case "is empty":
          filters.push({
            field,
            operator: "EQUALS",
            value: null,
          });
          break;

        case "is not empty":
          filters.push({
            field,
            operator: "DOES_NOT_EQUAL",
            value: null,
          });
          break;

        case "is":
          filters.push({
            field,
            operator: "EQUALS",
            value: filter.value,
          });
          break;

        case "is not":
          filters.push({
            field,
            operator: "DOES_NOT_EQUAL",
            value: filter.value,
          });
          break;

        case "contains":
          filters.push({
            field,
            operator: "CONTAINS_SEGMENT",
            value: filter.value,
          });
          break;

        case "does not contain":
          filters.push({
            field,
            operator: "DOES_NOT_CONTAIN_SEGMENT",
            value: filter.value,
          });
          break;

        default:
          break;
      }
    }
  }

  return { operator: data.operator, filters };
};

const mapMultiFilterToFormValues = (multiFilter: MultiFilter): FormValues => {
  const filters: FormValues["filters"] = [];

  for (const filter of multiFilter.filters) {
    const isTargetingEntityTypeId =
      filter.field[0] === "metadata" && filter.field[1] === "entityTypeId";
    const isTargetingProperty = filter.field[0] === "properties";

    if (isTargetingEntityTypeId) {
      if (filter.operator === "EQUALS") {
        filters.push({
          type: "Type",
          operator: "is",
          value: filter.value as string,
        });
      }

      /** @todo what about targeting a nested property? */
    } else if (isTargetingProperty && filter.field[1]) {
      const propertyTypeBaseUrl = filter.field[1] as string;

      const isEmpty = filter.operator === "EQUALS" && filter.value === null;
      const isNotEmpty =
        filter.operator === "DOES_NOT_EQUAL" && filter.value === null;
      const isEquals = filter.operator === "EQUALS" && filter.value !== null;
      const isNotEquals =
        filter.operator === "DOES_NOT_EQUAL" && filter.value !== null;
      const isContains =
        filter.operator === "CONTAINS_SEGMENT" && filter.value !== null;
      const isNotContains =
        filter.operator === "DOES_NOT_CONTAIN_SEGMENT" && filter.value !== null;

      const repeating: Pick<PropertyFilter, "type" | "propertyTypeBaseUrl"> = {
        type: "Property",
        propertyTypeBaseUrl,
      };

      if (isEmpty || isNotEmpty) {
        filters.push({
          ...repeating,
          operator: isEmpty ? "is empty" : "is not empty",
        });
      } else if (isEquals || isNotEquals) {
        filters.push({
          ...repeating,
          operator: isEquals ? "is" : "is not",
          value: filter.value as string,
        });
      } else if (isContains || isNotContains) {
        filters.push({
          ...repeating,
          operator: isContains ? "contains" : "does not contain",
          value: filter.value as string,
        });
      }
    }
  }

  return { operator: multiFilter.operator, filters };
};

export const EntityQueryEditor = ({
  onClose,
  onSave,
  entityTypes,
  propertyTypes,
  sx = [],
  defaultValue,
}: EntityQueryEditorProps) => {
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
      <Stack
        gap={2.5}
        sx={[
          {
            border: ({ palette }) => `1px solid ${palette.gray[30]}`,
            p: 2.5,
            borderRadius: 2,
            background: "white",
            overflowX: "auto",
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <EditorTitle />

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
            Save and run query
          </Button>
          <Button
            sx={{ backgroundColor: ({ palette }) => palette.gray[80] }}
            onClick={form.handleSubmit(onSubmit)}
          >
            Save as draft
          </Button>
          <Button variant="tertiary" onClick={onClose}>
            Discard draft
          </Button>
        </Stack>
      </Stack>
    </FormProvider>
  );
};
