import { PropertyType } from "@blockprotocol/type-system-web";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Button, ButtonProps } from "@hashintel/hash-design-system/button";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { TextField } from "@hashintel/hash-design-system/text-field";
import {
  addVersionToBaseUri,
  generateBaseTypeId,
  PrimitiveDataTypeKey,
  types,
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
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useBlockProtocolCreatePropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreatePropertyType";
import { useBlockProtocolGetPropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { FRONTEND_URL } from "../../../../lib/config";
import { getPersistedPropertyType } from "../../../../lib/subgraph";
import { QuestionIcon } from "./question-icon";
import { useRefetchPropertyTypes } from "./use-property-types";
import { useRouteNamespace } from "./use-route-namespace";

type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: typeof types["dataType"][PrimitiveDataTypeKey][];
};

const generateInitialPropertyTypeId = (baseUri: string) =>
  addVersionToBaseUri(baseUri, 1);

const faText: IconDefinition["icon"] = [
  448,
  512,
  [],
  "f893",
  "M448 56v80C448 149.3 437.3 160 424 160S400 149.3 400 136V80h-152v352h48c13.25 0 24 10.75 24 24S309.3 480 296 480h-144C138.8 480 128 469.3 128 456s10.75-24 24-24h48v-352H48v56C48 149.3 37.25 160 24 160S0 149.3 0 136v-80C0 42.75 10.75 32 24 32h400C437.3 32 448 42.75 448 56z",
];

const fa100: IconDefinition["icon"] = [
  512,
  512,
  [],
  "e41c",
  "M171.2 99.64C175.3 61.17 207.8 32 246.5 32C291.5 32 326.5 71.02 321.7 115.8L308.8 236.4C304.7 274.8 272.2 304 233.5 304C188.5 304 153.5 264.1 158.3 220.2L171.2 99.64zM246.5 80C232.3 80 220.4 90.68 218.9 104.8L205.1 225.3C204.2 241.7 217.1 256 233.5 256C247.7 256 259.6 245.3 261.1 231.2L274 110.7C275.8 94.28 262.9 80 246.5 80V80zM118.4 36.59C125.3 41.65 128.9 50.04 127.8 58.59L95.82 314.6C94.17 327.8 82.18 337.3 69.02 335.9C55.87 334.4 46.54 322.6 48.19 309.4L74.99 94.99L41.45 109.9C29.26 115.3 15.15 109.9 9.938 97.81C4.721 85.71 10.37 71.52 22.56 66.1L94.56 34.1C102.5 30.59 111.6 31.54 118.4 36.59V36.59zM507.2 114.1L499.9 202.5C496.6 241.8 463.8 272 424.3 272C379.1 272 345.1 234.1 348.8 189.9L356.1 101.5C359.4 62.23 392.3 32 431.7 32C476 32 510.9 69.91 507.2 114.1V114.1zM396.6 193.9C395.2 210.1 408 224 424.3 224C438.8 224 450.8 212.9 452 198.5L459.4 110.1C460.8 93.91 447.1 79.1 431.7 79.1C417.2 79.1 405.2 91.09 403.1 105.5L396.6 193.9zM511.7 323.9C513.9 336.1 505.1 349.4 492.1 351.7L28.08 431.7C15.02 433.9 2.605 425.1 .353 412.1C-1.899 399 6.864 386.6 19.93 384.3L483.9 304.3C496.1 302.1 509.4 310.9 511.7 323.9H511.7zM219.9 479.7C206.9 481.9 194.5 473 192.3 459.9C190.2 446.9 198.1 434.5 212.1 432.3L452.1 392.3C465.1 390.1 477.5 398.1 479.7 412.1C481.9 425.1 473 437.5 459.9 439.7L219.9 479.7z",
];

const faSquareCheck: IconDefinition["icon"] = [
  448,
  512,
  [],
  "f14a",
  "M211.8 339.8C200.9 350.7 183.1 350.7 172.2 339.8L108.2 275.8C97.27 264.9 97.27 247.1 108.2 236.2C119.1 225.3 136.9 225.3 147.8 236.2L192 280.4L300.2 172.2C311.1 161.3 328.9 161.3 339.8 172.2C350.7 183.1 350.7 200.9 339.8 211.8L211.8 339.8zM0 96C0 60.65 28.65 32 64 32H384C419.3 32 448 60.65 448 96V416C448 451.3 419.3 480 384 480H64C28.65 480 0 451.3 0 416V96zM48 96V416C48 424.8 55.16 432 64 432H384C392.8 432 400 424.8 400 416V96C400 87.16 392.8 80 384 80H64C55.16 80 48 87.16 48 96z",
];

const propertyTypeDataTypes = [
  {
    title: types.dataType.text.title,
    icon: faText,
    dataTypeId: types.dataType.text.dataTypeId,
  },
  {
    title: types.dataType.number.title,
    icon: fa100,
    dataTypeId: types.dataType.number.dataTypeId,
  },
  {
    title: types.dataType.boolean.title,
    icon: faSquareCheck,
    dataTypeId: types.dataType.boolean.dataTypeId,
  },
];

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

  const {
    register,
    handleSubmit: wrapHandleSubmit,
    formState: {
      isSubmitting,
      errors: { name: nameError, description: descriptionError },
      touchedFields: { description: descriptionTouched },
    },
    getValues,
    control,
    clearErrors,
    setFocus,
  } = useForm<PropertyTypeFormValues>({
    defaultValues: { name: initialTitle, description: "", expectedValues: [] },
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

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
      domain: FRONTEND_URL,
      namespace: routeNamespace.shortname,
      kind: "property-type",
      title: value,
    });
  };

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

  /**
   * Frustratingly, we have to track this ourselves
   * @see https://github.com/react-hook-form/react-hook-form/discussions/2633
   */
  const [titleValid, setTitleValid] = useState(false);
  const [descriptionValid, setDescriptionValid] = useState(false);

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
                  sx: {},
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
                  sx={{ alignSelf: "flex-start", width: "70%" }}
                  placeholder="Select acceptable values"
                />
              )}
              options={propertyTypeDataTypes}
              getOptionLabel={(obj) => obj.title}
              disableCloseOnSelect
              renderOption={(optProps, opt) => (
                <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
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
            />
          )}
          control={control}
          rules={{ required: true }}
          name="expectedValues"
        />
      </Stack>
      <Divider sx={{ mt: 2, mb: 3 }} />
      <Stack direction="row" spacing={1.25}>
        <Button
          loading={isSubmitting}
          disabled={isSubmitting || !!nameError}
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
