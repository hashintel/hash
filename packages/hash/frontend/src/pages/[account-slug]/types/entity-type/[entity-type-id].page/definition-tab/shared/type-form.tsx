import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  ButtonProps,
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/hash-design-system";
import { frontendUrl } from "@hashintel/hash-shared/environment";
import {
  generateBaseTypeId,
  SchemaKind,
} from "@hashintel/hash-shared/ontology-types";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
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
import { useRouter } from "next/router";
import {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  createElement,
  ElementType,
  forwardRef,
  ReactElement,
  ReactNode,
  Ref,
  useEffect,
  useState,
} from "react";
import {
  DeepPartial,
  FieldValues,
  Path,
  useForm,
  useFormContext,
} from "react-hook-form";
import { Modal } from "../../../../../../../components/Modals/Modal";
import { withHandler } from "../property-list-card/shared/with-handler";
import { QuestionIcon } from "./question-icon";

type TypeFormWrapperSubmitButtonProps = Omit<
  ButtonProps,
  "size" | "variant" | "disabled" | "type" | "loading"
>;

export const TypeFormNameField = ({
  fieldDisabled,
  typeExists,
}: {
  fieldDisabled: boolean;
  typeExists: (name: string) => Promise<boolean>;
}) => {
  const {
    register,
    formState: {
      isSubmitting,
      errors: { name: nameError },
    },
    getValues,
    clearErrors,
  } = useFormContext<{ name: string }>();

  /**
   * Frustratingly, we have to track this ourselves
   * @see https://github.com/react-hook-form/react-hook-form/discussions/2633
   */
  const [titleValid, setTitleValid] = useState(false);

  return (
    <TextField
      fullWidth
      label="Singular name"
      required
      placeholder="e.g. Stock Price"
      disabled={fieldDisabled ?? isSubmitting}
      {...(!fieldDisabled && {
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
          if (fieldDisabled) {
            setTitleValid(true);
            return true;
          }

          const exists = await typeExists(value);

          setTitleValid(getValues("name") === value && !exists);

          return exists ? "Property type name must be unique" : true;
        },
      })}
    />
  );
};

export const TypeFormDescriptionField = ({
  defaultValues,
  fieldDisabled,
}: {
  defaultValues: { description?: string };
  fieldDisabled: boolean;
}) => {
  const {
    register,
    formState: {
      isSubmitting,
      errors: { description: descriptionError },
      touchedFields: { description: descriptionTouched },
    },
    clearErrors,
  } = useFormContext<{ description: string }>();

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
      disabled={fieldDisabled ?? isSubmitting}
      {...(!fieldDisabled &&
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
  );
};

export type TypeFormProps<T extends FieldValues> = {
  onClose?: () => void;
  modalTitle: ReactNode;
  popupState: PopupState;
  onSubmit: (data: T) => Promise<void>;
  submitButtonProps: TypeFormWrapperSubmitButtonProps;
};

export const TypeForm = <T extends FieldValues>({
  children,
  defaultField,
  onClose,
  modalTitle,
  popupState,
  onSubmit,
  submitButtonProps,
}: {
  children: ReactNode;
  defaultField: Path<T>;
} & TypeFormProps<T>) => {
  const {
    handleSubmit: wrapHandleSubmit,
    formState: { isSubmitting, isValid },
    setFocus,
  } = useFormContext<T>();

  useEffect(() => {
    setFocus(defaultField);
  }, [setFocus, defaultField]);

  const handleSubmit = wrapHandleSubmit(onSubmit);

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
          event.stopPropagation(); // stop the parent submit being triggered

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
          {children}
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

export const generateInitialTypeUri = (baseUri: string) =>
  versionedUriFromComponents(baseUri, 1);

export const useGenerateTypeBaseUri = (kind: SchemaKind) => {
  const router = useRouter();
  const shortname = router.query["account-slug"]?.toString().slice(1) ?? "";

  return (value: string) => {
    if (!shortname) {
      throw new Error("Shortname must exist");
    }

    return generateBaseTypeId({
      domain: frontendUrl,
      namespace: shortname,
      kind,
      title: value,
    });
  };
};

export const useTypeForm = <T extends FieldValues>(
  defaultValues: DeepPartial<T>,
) => {
  return useForm<T>({
    defaultValues,
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onChange",
  });
};

type TypeFormModalProps<T extends ElementType = "div"> =
  ComponentPropsWithoutRef<T> & {
    as?: T;
    popupState: PopupState;
    ref?: Ref<ComponentPropsWithRef<T>["ref"]> | null;
  };

type PolymorphicProps<P, T extends ElementType> = P & TypeFormModalProps<T>;

type PolymorphicComponent<P, D extends ElementType = "div"> = <
  T extends ElementType = D,
>(
  props: PolymorphicProps<P, T>,
) => ReactElement | null;

export const TypeFormModal: PolymorphicComponent<{}, "div"> = forwardRef(
  <T extends ElementType>(
    props: TypeFormModalProps<T>,
    ref: Ref<HTMLElement>,
  ) => {
    const { as = "div", popupState, ...restProps } = props;

    const inner = createElement(as, {
      ...restProps,
      ref,
      // We want to pass the popupState to the inner component, but seems impossible to do so in a typesafe way
      ...({ popupState } as any),
    });

    return (
      <Modal
        {...bindDialog(popupState)}
        disableEscapeKeyDown
        contentStyle={(theme) => ({
          p: "0px !important",
          border: 1,
          borderColor: theme.palette.gray[20],
        })}
      >
        {inner}
      </Modal>
    );
  },
);
