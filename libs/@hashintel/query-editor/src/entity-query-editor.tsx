import { MultiFilter, PropertyType } from "@blockprotocol/graph";
import { Button } from "@hashintel/design-system";
import { Stack } from "@mui/material";
import { BoxProps } from "@mui/system";
import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { QueryForm } from "./entity-query-editor/query-form";
import { QueryPreview } from "./entity-query-editor/query-preview";
import { ReadonlyContextProvider } from "./entity-query-editor/readonly-context";
import { EditorTitle } from "./entity-query-editor/title";
import { FormValues, QueryEntitiesFunc } from "./entity-query-editor/types";
import {
  mapFormValuesToMultiFilter,
  mapMultiFilterToFormValues,
} from "./entity-query-editor/utils";

export interface EntityQueryEditorProps {
  onSave: (value: MultiFilter) => Promise<void>;
  saveTitle?: string;
  onDiscard: () => void;
  discardTitle?: string;
  sx?: BoxProps["sx"];
  propertyTypes: PropertyType[];
  defaultValue?: MultiFilter;
  queryEntities: QueryEntitiesFunc;
  readonly?: boolean;
}

export const EntityQueryEditor = ({
  onDiscard,
  onSave,
  propertyTypes,
  sx = [],
  defaultValue,
  queryEntities,
  readonly,
  discardTitle,
  saveTitle,
}: EntityQueryEditorProps) => {
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: defaultValue
      ? mapMultiFilterToFormValues(defaultValue)
      : { operator: "AND", filters: [] },
  });

  const [multiFilter, setMultiFilter] = useState<MultiFilter | undefined>(
    defaultValue,
  );

  const onSubmitPreview = (data: FormValues) => {
    setMultiFilter(mapFormValuesToMultiFilter(data));
    setShowPreview(true);
  };

  const onSubmitSave = async (data: FormValues) => {
    try {
      setSaving(true);
      await onSave(mapFormValuesToMultiFilter(data));
    } finally {
      setSaving(false);
    }
  };

  const formValue = useWatch({ control: form.control });
  const [prevFormValue, setPrevFormValue] = useState(formValue);

  /** hide preview when form value changes */
  if (prevFormValue !== formValue) {
    setPrevFormValue(formValue);
    setShowPreview(false);
  }

  return (
    <ReadonlyContextProvider readonly={!!readonly}>
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

          <QueryForm propertyTypes={propertyTypes} />

          <Stack direction="row" gap={1}>
            <Button
              onClick={
                showPreview
                  ? () => setShowPreview(false)
                  : form.handleSubmit(onSubmitPreview)
              }
            >
              {showPreview ? "Hide preview" : "Preview query"}
            </Button>
            {!readonly && (
              <Button
                onClick={form.handleSubmit(onSubmitSave)}
                sx={{ backgroundColor: ({ palette }) => palette.gray[80] }}
                loadingText="Saving..."
                loading={saving}
              >
                {saveTitle ?? "Save query"}
              </Button>
            )}
            {!readonly && (
              <Button variant="tertiary" onClick={onDiscard} disabled={saving}>
                {discardTitle ?? "Discard query"}
              </Button>
            )}
          </Stack>

          {showPreview && multiFilter && (
            <QueryPreview query={multiFilter} queryEntities={queryEntities} />
          )}
        </Stack>
      </FormProvider>
    </ReadonlyContextProvider>
  );
};
