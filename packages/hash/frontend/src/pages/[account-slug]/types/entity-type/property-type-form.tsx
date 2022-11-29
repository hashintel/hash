import { VersionedUri } from "@blockprotocol/type-system-web";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  ButtonProps,
  Chip,
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/hash-design-system";
import { frontendUrl } from "@hashintel/hash-shared/environment";
import { generateBaseTypeId, types } from "@hashintel/hash-shared/types";
import {
  Autocomplete,
  Box,
  Divider,
  inputLabelClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  bindDialog,
  bindToggle,
  PopupState,
} from "material-ui-popup-state/hooks";
import { ComponentProps, ReactNode, useEffect, useMemo, useState } from "react";
import { Controller, useForm, UseFormTrigger } from "react-hook-form";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { useBlockProtocolGetPropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { Modal } from "../../../../components/Modals/Modal";
import { fa100 } from "../../../../shared/icons/pro/fa-100";
import { faSquareCheck } from "../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../shared/icons/pro/fa-text";
import { QuestionIcon } from "./question-icon";
import { useRouteNamespace } from "./use-route-namespace";
import { withHandler } from "./util";

const generateInitialPropertyTypeId = (baseUri: string) =>
  versionedUriFromComponents(baseUri, 1);

const propertyTypeDataTypesOptions = [
  types.dataType.text.dataTypeId,
  types.dataType.number.dataTypeId,
  types.dataType.boolean.dataTypeId,
];

const propertyTypeDataTypeData = {
  [types.dataType.text.dataTypeId]: {
    title: types.dataType.text.title,
    icon: faText,
  },
  [types.dataType.number.dataTypeId]: {
    title: types.dataType.number.title,
    icon: fa100,
  },
  [types.dataType.boolean.dataTypeId]: {
    title: types.dataType.boolean.title,
    icon: faSquareCheck,
  },
};

export type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: VersionedUri[];
};

type PropertyTypeFormSubmitProps = Omit<
  ButtonProps,
  "size" | "variant" | "disabled" | "type" | "loading"
>;

const useTriggerValidation = (
  defaultValues: Partial<PropertyTypeFormValues>,
  disabledFields: Set<keyof PropertyTypeFormValues>,
  trigger: UseFormTrigger<PropertyTypeFormValues>,
) => {
  const keys = (
    Object.keys(defaultValues) as any as (keyof typeof defaultValues)[]
  ).filter(
    (key) =>
      typeof defaultValues[key] !== "undefined" && !disabledFields.has(key),
  );
  const stringifiedKeys = JSON.stringify(keys);
  const defaultValuesKeys = useMemo(
    () => JSON.parse(stringifiedKeys) as typeof keys,
    [stringifiedKeys],
  );

  useEffect(() => {
    for (const key of defaultValuesKeys) {
      void trigger(key);
    }
  }, [trigger, defaultValuesKeys]);
};

const PropertyTypeFormInner = ({
  onClose,
  modalTitle,
  popupState,
  onSubmit,
  submitButtonProps,
  getDefaultValues,
  fieldProps = {},
}: {
  onClose?: () => void;
  modalTitle: ReactNode;
  popupState: PopupState;
  onSubmit: (data: PropertyTypeFormValues) => Promise<void>;
  submitButtonProps: PropertyTypeFormSubmitProps;
  getDefaultValues?: () => Partial<PropertyTypeFormValues>;
  fieldProps?: Partial<
    Record<keyof PropertyTypeFormValues, { disabled?: boolean }>
  >;
}) => {
  const defaultValues = getDefaultValues?.() ?? {};

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
    trigger,
  } = useForm<PropertyTypeFormValues>({
    defaultValues: {
      name: defaultValues.name ?? "",
      description: defaultValues.description ?? "",
      expectedValues: defaultValues.expectedValues ?? [],
    },
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const defaultField = defaultValues.name ? "description" : "name";

  useEffect(() => {
    setFocus(defaultField);
  }, [setFocus, defaultField]);

  const disabledFields = new Set(
    (Object.keys(fieldProps) as any as (keyof typeof fieldProps)[]).filter(
      (key) => fieldProps[key]?.disabled,
    ),
  );
  useTriggerValidation(defaultValues, disabledFields, trigger);

  const { routeNamespace } = useRouteNamespace();

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

  const handleSubmit = wrapHandleSubmit(onSubmit);

  /**
   * Frustratingly, we have to track this ourselves
   * @see https://github.com/react-hook-form/react-hook-form/discussions/2633
   */
  const [titleValid, setTitleValid] = useState(false);
  const [descriptionValid, setDescriptionValid] = useState(false);

  /**
   * Some default property types don't have descriptions. We don't want to have
   * to enter one if you pass a preset value for description which is falsey
   *
   * @todo remove this when all property types have descriptions
   */
  const descriptionRequired =
    !("description" in defaultValues) || !!defaultValues.description;

  return (
    <>
      <Box
        sx={(theme) => ({
          px: 2.5,
          pr: 1.5,
          pb: 1.5,
          pt: 2,
          borderBottom: 1,
          borderColor: theme.palette.gray[20],
          alignItems: "center",
          display: "flex",
        })}
      >
        <Typography
          variant="regularTextLabels"
          sx={{ fontWeight: 500, display: "flex", alignItems: "center" }}
        >
          {modalTitle}
        </Typography>
        <IconButton
          {...withHandler(bindToggle(popupState), onClose)}
          sx={(theme) => ({
            ml: "auto",
            svg: {
              color: theme.palette.gray[50],
              fontSize: 20,
            },
          })}
          disabled={isSubmitting}
        >
          <FontAwesomeIcon icon={faClose} />
        </IconButton>
      </Box>
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
            disabled={fieldProps.name?.disabled ?? isSubmitting}
            {...(!fieldProps.name?.disabled && {
              error: !!nameError,
              helperText: nameError?.message,
              success: titleValid,
            })}
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

                const res = await getPropertyType({
                  data: {
                    propertyTypeId,
                    graphResolveDepths: {
                      constrainsValuesOn: { outgoing: 0 },
                      constrainsPropertiesOn: { outgoing: 0 },
                    },
                  },
                });

                const exists =
                  !res.data || !!getPropertyTypeById(res.data, propertyTypeId);

                if (getValues("name") === value && !exists) {
                  setTitleValid(true);
                } else {
                  setTitleValid(false);
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
            required={descriptionRequired}
            placeholder="Describe this property type in one or two sentences"
            disabled={fieldProps.description?.disabled ?? isSubmitting}
            {...(!fieldProps.description?.disabled &&
              descriptionTouched && {
                success: descriptionValid,
                error: !!descriptionError,
              })}
            {...register("description", {
              required: descriptionRequired,
              onChange() {
                clearErrors("description");
                setDescriptionValid(false);
              },
              validate(value) {
                const valid = !descriptionRequired || !!value;

                setDescriptionValid(valid);
                return valid ? true : "You must choose a description";
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
                  value.map((opt, index) => (
                    <Chip
                      {...getTagProps({ index })}
                      key={opt}
                      label={
                        <Typography
                          variant="smallTextLabels"
                          sx={{ display: "flex", alignItems: "center" }}
                        >
                          <FontAwesomeIcon
                            icon={{ icon: propertyTypeDataTypeData[opt]!.icon }}
                            sx={{ fontSize: "1em", mr: "1ch" }}
                          />
                          {propertyTypeDataTypeData[opt]!.title}
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
                options={propertyTypeDataTypesOptions}
                getOptionLabel={(opt) => propertyTypeDataTypeData[opt]!.title}
                disableCloseOnSelect
                renderOption={(optProps, opt) => (
                  <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                    <FontAwesomeIcon
                      icon={{ icon: propertyTypeDataTypeData[opt]!.icon }}
                      sx={(theme) => ({ color: theme.palette.gray[50] })}
                    />
                    <Typography
                      variant="smallTextLabels"
                      component="span"
                      ml={1.5}
                      color={(theme) => theme.palette.gray[80]}
                    >
                      {propertyTypeDataTypeData[opt]!.title}
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
            {...submitButtonProps}
            loading={isSubmitting}
            disabled={isSubmitting || !isValid}
            type="submit"
            size="small"
          >
            {submitButtonProps.children}
          </Button>
          <Button
            {...withHandler(bindToggle(popupState), onClose)}
            disabled={isSubmitting}
            size="small"
            variant="tertiary"
          >
            Discard draft
          </Button>
        </Stack>
      </Box>
    </>
  );
};

export const PropertyTypeForm = ({
  popupState,
  ...props
}: ComponentProps<typeof PropertyTypeFormInner>) => (
  <Modal
    {...bindDialog(popupState)}
    disableEscapeKeyDown
    contentStyle={(theme) => ({
      p: "0px !important",
      border: 1,
      borderColor: theme.palette.gray[20],
    })}
  >
    <PropertyTypeFormInner {...props} popupState={popupState} />
  </Modal>
);
