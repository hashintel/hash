import { PropertyType, PropertyValues } from "@blockprotocol/type-system-web";
import {
  Button,
  ButtonProps,
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import {
  addVersionToBaseUri,
  generateBaseTypeId,
} from "@hashintel/hash-shared/types";
import {
  Autocomplete,
  Box,
  Divider,
  inputLabelClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { frontendUrl } from "@hashintel/hash-shared/environment";
import { useBlockProtocolCreatePropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreatePropertyType";
import { useBlockProtocolGetPropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { getPersistedPropertyType } from "../../../../lib/subgraph";
import { QuestionIcon } from "./question-icon";
import { useRefetchPropertyTypes } from "./use-property-types";
import { useRouteNamespace } from "./use-route-namespace";
import {
  PropertyTypeSelectorDropdown,
  PropertyTypeSelectorDropdownContext,
} from "./property-type-selector-dropdown";
import { DataType, propertyTypeDataTypes } from "./property-type-utils";

const generateInitialPropertyTypeId = (baseUri: string) =>
  addVersionToBaseUri(baseUri, 1);

export type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: typeof propertyTypeDataTypes;
  creatingPropertyId?: string;
  flattenedCreatingProperties: Record<string, DataType>;
};

export const PropertyTypeForm = ({
  discardButtonProps,
  initialTitle,
  onCreatePropertyType,
}: {
  discardButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  initialTitle?: string;
  onCreatePropertyType: (propertyType: PropertyType) => void;
}) => {
  const refetchPropertyTypes = useRefetchPropertyTypes();

  const formMethods = useForm<PropertyTypeFormValues>({
    defaultValues: { name: initialTitle, description: "", expectedValues: [] },
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  const {
    register,
    handleSubmit: wrapHandleSubmit,
    formState: {
      isSubmitting,
      errors: { name: nameError, description: descriptionError },
      touchedFields: { description: descriptionTouched },
      isValid,
    },
    getValues,
    control,
    clearErrors,
    setFocus,
    setValue,
    watch,
  } = formMethods;

  const creatingProperty = watch("creatingPropertyId");
  const expectedValues = watch("expectedValues");

  console.log(expectedValues);

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);
  const [creatingCustomPropertyType, setCreatingCustomPropertyType] =
    useState(false);

  useEffect(() => {
    setFocus(initialTitle ? "description" : "name");
  }, [initialTitle, setFocus]);

  const routeNamespace = useRouteNamespace();

  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    routeNamespace?.id ?? "",
  );
  const { getPropertyType } = useBlockProtocolGetPropertyType();

  const generatePropertyTypeBaseUriForUser = (value: string) => {
    if (!routeNamespace?.shortname) {
      throw new Error("User shortname must exist");
    }

    return generateBaseTypeId({
      domain: frontendUrl,
      namespace: routeNamespace.shortname,
      kind: "property-type",
      title: value,
    });
  };

  const handleSubmit = wrapHandleSubmit(async (data) => {
    const res = await createPropertyType({
      data: {
        propertyType: {
          oneOf: data.expectedValues ? getItems(data.expectedValues) : [],
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

  /**
   * Frustratingly, we have to track this ourselves
   * @see https://github.com/react-hook-form/react-hook-form/discussions/2633
   */
  const [titleValid, setTitleValid] = useState(false);
  const [descriptionValid, setDescriptionValid] = useState(false);

  const propertyTypeSelectorDropdownContextValue = useMemo(
    () => ({
      customPropertyMenuOpen: creatingCustomPropertyType,
      openCustomPropertyMenu: () => setCreatingCustomPropertyType(true),
      closeCustomPropertyMenu: () => {
        setValue("creatingPropertyId", undefined);
        setCreatingCustomPropertyType(false);
      },
    }),
    [creatingCustomPropertyType, setCreatingCustomPropertyType, setValue],
  );

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
          error={!!nameError}
          helperText={nameError?.message}
          success={titleValid}
          {...register("name", {
            required: true,
            onChange() {
              clearErrors("name");
              setTitleValid(false);
            },
            async validate(value) {
              const propertyTypeId = generateInitialPropertyTypeId(
                generatePropertyTypeBaseUriForUser(value),
              );

              const res = await getPropertyType({ data: { propertyTypeId } });

              const exists =
                !res.data ||
                !!getPersistedPropertyType(res.data, propertyTypeId);

              if (getValues("name") === value && !exists) {
                setTitleValid(true);
              }

              return exists ? "Property type name must be unique" : true;
            },
          })}
        />
        <TextField
          multiline
          inputProps={{ minRows: 1 }}
          label={
            <>
              Description{" "}
              <Tooltip
                placement="top"
                title="Descriptions help people understand what property types can be used for, and help make them more discoverable (allowing for reuse)."
                PopperProps={{
                  modifiers: [
                    {
                      name: "offset",
                      options: {
                        offset: [0, 8],
                      },
                    },
                  ],
                }}
              >
                <Box
                  sx={{
                    order: 1,
                    ml: 0.75,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <QuestionIcon />
                </Box>
              </Tooltip>
            </>
          }
          required
          placeholder="Describe this property type in one or two sentences"
          disabled={isSubmitting}
          success={descriptionValid}
          error={!!descriptionError && descriptionTouched}
          {...register("description", {
            required: true,
            onChange() {
              clearErrors("description");
              setDescriptionValid(false);
            },
            validate(value) {
              setDescriptionValid(!!value);

              return value ? true : "You must choose a description";
            },
          })}
        />
        <FormProvider {...formMethods}>
          <Controller
            render={({ field: { onChange, onBlur, ...props } }) => (
              <PropertyTypeSelectorDropdownContext.Provider
                value={propertyTypeSelectorDropdownContextValue}
              >
                <Autocomplete
                  disabled={!!creatingProperty}
                  multiple
                  popupIcon={null}
                  clearIcon={null}
                  forcePopupIcon={false}
                  selectOnFocus={false}
                  open={autocompleteFocused || creatingCustomPropertyType}
                  clearOnBlur={false}
                  onFocus={() => {
                    setAutocompleteFocused(true);
                  }}
                  onBlur={() => {
                    onBlur();
                    setAutocompleteFocused(false);
                  }}
                  onChange={(_evt, data) => {
                    onChange(data);
                  }}
                  {...props}
                  PaperComponent={PropertyTypeSelectorDropdown}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        {...getTagProps({ index })}
                        key={option.dataTypeId}
                        label={
                          <Typography
                            variant="smallTextLabels"
                            sx={{ display: "flex", alignItems: "center" }}
                          >
                            <FontAwesomeIcon
                              icon={{ icon: option.icon }}
                              sx={{ fontSize: "1em", mr: "1ch" }}
                            />
                            {option.title}
                          </Typography>
                        }
                        color="blue"
                      />
                    ))
                  }
                  renderInput={(inputProps) => (
                    <TextField
                      {...inputProps}
                      label="Expected values"
                      sx={{
                        alignSelf: "flex-start",
                        width: "70%",
                      }}
                      placeholder="Select acceptable values"
                    />
                  )}
                  options={propertyTypeDataTypes}
                  getOptionLabel={(obj) => obj.title}
                  disableCloseOnSelect
                  disablePortal
                  renderOption={(optProps, opt) => (
                    <Box
                      component="li"
                      {...optProps}
                      sx={{ py: 1.5, px: 2.25 }}
                    >
                      <FontAwesomeIcon
                        icon={{ icon: opt.icon }}
                        sx={(theme) => ({ color: theme.palette.gray[50] })}
                      />
                      <Typography
                        variant="smallTextLabels"
                        component="span"
                        ml={1.5}
                        color={(theme) => theme.palette.gray[80]}
                      >
                        {opt.title}
                      </Typography>
                      <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
                    </Box>
                  )}
                  componentsProps={{
                    popper: {
                      sx: { width: "100% !important" },
                      placement: "bottom-start",
                    },
                  }}
                />
              </PropertyTypeSelectorDropdownContext.Provider>
            )}
            control={control}
            rules={{ required: true }}
            name="expectedValues"
          />
        </FormProvider>
      </Stack>
      <Divider sx={{ mt: 2, mb: 3 }} />
      <Stack direction="row" spacing={1.25}>
        <Button
          loading={isSubmitting}
          disabled={isSubmitting || !isValid}
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
