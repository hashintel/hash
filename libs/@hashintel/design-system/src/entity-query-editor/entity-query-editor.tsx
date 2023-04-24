import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Box, Stack } from "@mui/material";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";

import { Button } from "../button";
import { FontAwesomeIcon } from "../fontawesome-icon";
import { FilterRow } from "./filter-row/filter-row";
import { EditorTitle } from "./title";
import { EntityQueryEditorProps, FormValues } from "./types";

export const EntityQueryEditor = ({
  onClose,
  onSave,
  sx = [],
}: EntityQueryEditorProps) => {
  const form = useForm<FormValues>({
    defaultValues: { operator: "AND", filters: [] },
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
    console.log("submit", data);
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
