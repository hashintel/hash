import { EntityType, MultiFilter, PropertyType } from "@blockprotocol/graph";
import { Button } from "@hashintel/design-system";
import { Stack } from "@mui/material";
import { BoxProps } from "@mui/system";
import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { QueryForm } from "./entity-query-editor/query-form";
import { QueryPreview } from "./entity-query-editor/query-preview";
import { ReadonlyContextProvider } from "./entity-query-editor/readonly-context";
import { FormValues, QueryEntitiesFunc } from "./entity-query-editor/types";
import {
  mapFormValuesToMultiFilter,
  mapMultiFilterToFormValues,
} from "./entity-query-editor/utils";

export interface EntityQueryEditorProps {
  onSave: (value: MultiFilter) => Promise<void>;
  saveTitle?: string;
  onDiscard?: () => void;
  discardTitle?: string;
  sx?: BoxProps["sx"];
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
  defaultValue?: MultiFilter;
  queryEntities?: QueryEntitiesFunc;
  readonly?: boolean;
}

export const EntityQueryEditor = ({
  onDiscard,
  onSave,
  entityTypes,
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

  const handleDiscard = () => {
    form.reset();
    onDiscard?.();
  };

  return (
    <ReadonlyContextProvider readonly={!!readonly}>
      <FormProvider {...form}>
        <Stack gap={2.5} sx={sx}>
          <QueryForm entityTypes={entityTypes} propertyTypes={propertyTypes} />

          <Stack direction="row" gap={1}>
            {queryEntities ? (
              <Button
                onClick={
                  showPreview
                    ? () => setShowPreview(false)
                    : form.handleSubmit(onSubmitPreview)
                }
              >
                {showPreview ? "Hide preview" : "Preview query"}
              </Button>
            ) : null}
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
              <Button
                variant="tertiary"
                onClick={handleDiscard}
                disabled={saving}
              >
                {discardTitle ?? "Discard query"}
              </Button>
            )}
          </Stack>

          {showPreview && multiFilter && queryEntities && (
            <QueryPreview query={multiFilter} queryEntities={queryEntities} />
          )}
        </Stack>
      </FormProvider>
    </ReadonlyContextProvider>
  );
};
