import { PropertyType } from "@blockprotocol/type-system-web";
import { Button, ButtonProps } from "@hashintel/hash-design-system/button";
import { Chip } from "@hashintel/hash-design-system/chip";
import { TextField } from "@hashintel/hash-design-system/text-field";
import { PrimitiveDataTypeKey, types } from "@hashintel/hash-shared/types";
import {
  Autocomplete,
  Box,
  Divider,
  inputLabelClasses,
  Stack,
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { useBlockProtocolCreatePropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreatePropertyType";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";
import { QuestionIcon } from "./question-icon";
import { useRefetchPropertyTypes } from "./use-property-types";

// @todo add expected values
type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: typeof types["dataType"][PrimitiveDataTypeKey][];
};

export const PropertyTypeForm = ({
  createButtonProps,
  discardButtonProps,
  initialTitle,
  onCreatePropertyType,
}: {
  createButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  discardButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  initialTitle?: string;
  onCreatePropertyType: (propertyType: PropertyType) => void;
}) => {
  const refetchPropertyTypes = useRefetchPropertyTypes();

  const {
    register,
    handleSubmit: wrapHandleSubmit,
    formState: { isSubmitting },
    control,
  } = useForm<PropertyTypeFormValues>({
    defaultValues: { name: initialTitle, description: "", expectedValues: [] },
  });

  const { authenticatedUser } = useAuthenticatedUser();
  // @todo namespace accounts?
  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    authenticatedUser?.entityId ?? "",
  );

  const handleSubmit = wrapHandleSubmit(async (data) => {
    const res = await createPropertyType({
      data: {
        propertyType: {
          oneOf: data.expectedValues.map((value) => ({
            $ref: value.dataTypeId,
          })),
          description: data.description,
          title: data.name,
          kind: "propertyType",
          pluralTitle: data.name,
        },
      },
    });

    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    await refetchPropertyTypes?.();

    onCreatePropertyType(res.data.propertyType);
  });

  return (
    <Box
      minWidth={500}
      p={3}
      component="form"
      display="block"
      onSubmit={handleSubmit}
    >
      <Stack
        alignItems="stretch"
        spacing={3}
        sx={{
          [`.${inputLabelClasses.root}`]: {
            display: "flex",
            alignItems: "center",
          },
        }}
      >
        <TextField
          label="Singular name"
          required
          placeholder="e.g. Stock Price"
          disabled={isSubmitting}
          {...register("name", { required: true })}
        />
        <TextField
          multiline
          inputProps={{ minRows: 1 }}
          label={
            <>
              Description <QuestionIcon sx={{ order: 1, ml: 0.75 }} />
            </>
          }
          required
          placeholder="Describe this property type in one or two sentences"
          disabled={isSubmitting}
          {...register("description", { required: true })}
        />
        <Controller
          render={({ field: { onChange, ...props } }) => (
            <Autocomplete
              multiple
              popupIcon={null}
              clearIcon={null}
              forcePopupIcon={false}
              selectOnFocus={false}
              openOnFocus
              clearOnBlur={false}
              onChange={(_evt, data) => onChange(data)}
              {...props}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option.dataTypeId}
                    label={option.title}
                  />
                ))
              }
              renderInput={(inputProps) => (
                <TextField
                  {...inputProps}
                  label="Expected values"
                  sx={{ alignSelf: "flex-start", width: "70%" }}
                  placeholder="Select acceptable values"
                />
              )}
              options={Object.values(types.dataType)}
              getOptionLabel={(obj) => obj.title}
            />
          )}
          control={control}
          rules={{ required: true }}
          name="expectedValues"
          onChange={([, data]) => data}
        />
      </Stack>
      <Divider sx={{ mt: 2, mb: 3 }} />
      <Stack direction="row" spacing={1.25}>
        <Button
          {...createButtonProps}
          loading={isSubmitting}
          type="submit"
          size="small"
        >
          Create new property type
        </Button>
        <Button
          {...discardButtonProps}
          disabled={isSubmitting}
          size="small"
          variant="tertiary"
        >
          Discard draft
        </Button>
      </Stack>
    </Box>
  );
};
