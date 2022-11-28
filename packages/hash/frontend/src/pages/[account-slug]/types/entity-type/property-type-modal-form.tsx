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
import { ComponentProps, ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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

export type PropertyTypeModalFormValues = {
  name: string;
  description: string;
  expectedValues: typeof propertyTypeDataTypes;
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
  defaultValues = {},
}: {
  onClose?: () => void;
  modalTitle: ReactNode;
  popupState: PopupState;
  onSubmit: (data: PropertyTypeModalFormValues) => Promise<void>;
  submitButtonProps: PropertyTypeModalFormSubmitProps;
  defaultValues?: Partial<PropertyTypeModalFormValues>;
}) => {
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
    setFocus(defaultValues.name ? "description" : "name");
  }, [defaultValues.name, setFocus]);

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
