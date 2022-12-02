import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  ButtonProps,
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/hash-design-system";
import { frontendUrl } from "@hashintel/hash-shared/environment";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { generateBaseTypeId } from "@hashintel/hash-shared/types";
import {
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
import { FormProvider, useForm, UseFormTrigger } from "react-hook-form";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { useBlockProtocolGetPropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { Modal } from "../../../../components/Modals/Modal";
import { DataTypeSelector } from "./data-type-selector";
import { PropertyTypeSelectorDropdownContext } from "./property-type-selector-dropdown";
import {
  DataType,
  ExpectedValue,
  getPropertyTypeSchema,
} from "./property-type-utils";
import { QuestionIcon } from "./question-icon";
import { useRouteNamespace } from "./use-route-namespace";
import { withHandler } from "./util";

const generateInitialPropertyTypeId = (baseUri: string) =>
  versionedUriFromComponents(baseUri, 1);

export type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: ExpectedValue[];
  creatingPropertyId?: string;
  flattenedPropertyList: Record<string, DataType>;
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

// @todo consider calling for consumer
export const formDataToPropertyType = (data: PropertyTypeFormValues) => ({
  oneOf: getPropertyTypeSchema(data.expectedValues),
  description: data.description,
  title: data.name,
  kind: "propertyType" as const,
});

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

  const formMethods = useForm<PropertyTypeFormValues>({
    defaultValues: {
      name: defaultValues.name ?? "",
      description: defaultValues.description ?? "",
      expectedValues: defaultValues.expectedValues ?? [],
    },
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onChange",
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
    clearErrors,
    setFocus,
    trigger,
    setValue,
  } = formMethods;

  const [creatingCustomPropertyType, setCreatingCustomPropertyType] =
    useState(false);

  const propertyTypeSelectorDropdownContextValue = useMemo(
    () => ({
      customPropertyMenuOpen: creatingCustomPropertyType,
      openCustomPropertyMenu: () => setCreatingCustomPropertyType(true),
      closeCustomPropertyMenu: () => {
        setValue("creatingPropertyId", undefined);
        setValue("flattenedPropertyList", {});
        setCreatingCustomPropertyType(false);
      },
    }),
    [creatingCustomPropertyType, setCreatingCustomPropertyType, setValue],
  );

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
        onSubmit={(event) => {
          event.stopPropagation(); // stop the entity type's submit being triggered

          void handleSubmit(event);
        }}
      >
        <Stack
          alignItems="flex-start"
          spacing={3}
          sx={{
            [`.${inputLabelClasses.root}`]: {
              display: "flex",
              alignItems: "center",
            },
          }}
        >
          <TextField
            fullWidth
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
                if (fieldProps.name?.disabled) {
                  setTitleValid(true);
                  return true;
                }

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

                setTitleValid(getValues("name") === value && !exists);

                return exists ? "Property type name must be unique" : true;
              },
            })}
          />
          <TextField
            multiline
            fullWidth
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

          <FormProvider {...formMethods}>
            <PropertyTypeSelectorDropdownContext.Provider
              value={propertyTypeSelectorDropdownContextValue}
            >
              <DataTypeSelector />
            </PropertyTypeSelectorDropdownContext.Provider>
          </FormProvider>
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
