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
import {
  addVersionToBaseUri,
  generateBaseTypeId,
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
import {
  bindDialog,
  bindToggle,
  PopupState,
} from "material-ui-popup-state/hooks";
import { ComponentProps, ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useBlockProtocolGetPropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { Modal } from "../../../../components/Modals/Modal";
import { getPersistedPropertyType } from "../../../../lib/subgraph";
import { fa100 } from "../../../../shared/icons/pro/fa-100";
import { faSquareCheck } from "../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../shared/icons/pro/fa-text";
import { QuestionIcon } from "./question-icon";
import { useRouteNamespace } from "./use-route-namespace";
import { withHandler } from "./util";

const generateInitialPropertyTypeId = (baseUri: string) =>
  addVersionToBaseUri(baseUri, 1);

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

export type PropertyTypeModalFormValues = {
  name: string;
  description: string;
  expectedValues: VersionedUri[];
};

type PropertyTypeModalFormSubmitProps = Omit<
  ButtonProps,
  "size" | "variant" | "disabled" | "type" | "loading"
>;

const PropertyTypeForm = ({
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
  onSubmit: (data: PropertyTypeModalFormValues) => Promise<void>;
  submitButtonProps: PropertyTypeModalFormSubmitProps;
  getDefaultValues?: () => Partial<PropertyTypeModalFormValues>;
  fieldProps?: Partial<
    Record<keyof PropertyTypeModalFormValues, { disabled?: boolean }>
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
  } = useForm<PropertyTypeModalFormValues>({
    defaultValues: {
      name: "",
      description: "",
      expectedValues: [],
      ...defaultValues,
    },
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  useEffect(() => {
    if (defaultValues.name) {
      void trigger("name");
      setFocus("description");
    } else {
      setFocus("name");
    }
  }, [defaultValues.name, setFocus, trigger]);

  const routeNamespace = useRouteNamespace();

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
                if (defaultValues.name && value === defaultValues.name) {
                  setTitleValid(true);

                  return true;
                }

                const propertyTypeId = generateInitialPropertyTypeId(
                  generatePropertyTypeBaseUriForUser(value),
                );

                const res = await getPropertyType({
                  data: { propertyTypeId },
                });

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
            disabled={fieldProps.description?.disabled ?? isSubmitting}
            {...(!fieldProps.description?.disabled && {
              success: descriptionValid,
              error: !!descriptionError && descriptionTouched,
            })}
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

export const PropertyTypeModalForm = ({
  popupState,
  ...props
}: ComponentProps<typeof PropertyTypeForm>) => (
  <Modal
    {...bindDialog(popupState)}
    disableEscapeKeyDown
    contentStyle={(theme) => ({
      p: "0px !important",
      border: 1,
      borderColor: theme.palette.gray[20],
    })}
  >
    <PropertyTypeForm {...props} popupState={popupState} />
  </Modal>
);
