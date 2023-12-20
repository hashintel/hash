import { BaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  AutocompleteDropdown,
  Button,
  Chip,
  FontAwesomeIcon,
  StyledPlusCircleIcon,
  TextField,
} from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";
import { Autocomplete, Box, PaperProps, Typography } from "@mui/material";
import { useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useController,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";

import {
  CustomExpectedValueTypeId,
  useDataTypesOptions,
} from "../../../shared/data-types-options-context";
import { useStateCallback } from "../../shared/use-state-callback";
import { getExpectedValueDescriptor } from "../shared/get-expected-value-descriptor";
import { PropertyTypeFormValues } from "../shared/property-type-form-values";
import { CustomExpectedValueBuilder } from "./expected-value-selector/custom-expected-value-builder";
import { ExpectedValueChip } from "./expected-value-selector/expected-value-chip";
import {
  CustomExpectedValueBuilderContext,
  CustomExpectedValueBuilderContextValue,
  useCustomExpectedValueBuilderContext,
} from "./expected-value-selector/shared/custom-expected-value-builder-context";
import { ExpectedValueSelectorFormValues } from "./expected-value-selector/shared/expected-value-selector-form-values";

const ExpectedValueSelectorDropdown = ({ children, ...props }: PaperProps) => {
  const { customExpectedValueBuilderOpen, handleEdit } =
    useCustomExpectedValueBuilderContext();

  return (
    <AutocompleteDropdown {...props}>
      {customExpectedValueBuilderOpen ? (
        <CustomExpectedValueBuilder />
      ) : (
        <>
          {children}

          <Button
            variant="tertiary"
            startIcon={<StyledPlusCircleIcon />}
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              mt: 1,
            }}
            onMouseDown={(event) => {
              // prevent dropdown from closing
              event.preventDefault();
            }}
            onClick={() => {
              handleEdit();
            }}
          >
            <Typography
              variant="smallTextLabels"
              sx={(theme) => ({
                color: theme.palette.gray[60],
                fontWeight: 500,
              })}
            >
              Specify a custom expected value
            </Typography>

            <Chip color="purple" label="PROPERTY TYPE" sx={{ ml: 1.5 }} />
          </Button>
        </>
      )}
    </AutocompleteDropdown>
  );
};

export const ExpectedValueSelector = ({
  propertyTypeBaseUrl,
}: {
  propertyTypeBaseUrl?: BaseUrl;
}) => {
  const propertyTypeFormMethods = useFormContext<PropertyTypeFormValues>();

  const expectedValueSelectorFormMethods =
    useForm<ExpectedValueSelectorFormValues>({
      defaultValues: {
        propertyTypeBaseUrl,
        flattenedCustomExpectedValueList: {},
      },
      shouldFocusError: true,
      mode: "onBlur",
      reValidateMode: "onChange",
    });

  const [expectedValuesValid, setExpectedValuesValid] = useState(false);

  const {
    field: expectedValuesField,
    formState: {
      isSubmitting,
      errors: { expectedValues: expectedValuesError },
    },
  } = useController({
    control: propertyTypeFormMethods.control,
    name: "expectedValues",
    rules: {
      onChange() {
        propertyTypeFormMethods.clearErrors("expectedValues");
        setExpectedValuesValid(false);
      },
      validate: (value) => {
        setExpectedValuesValid(!!value.length);
        return value.length
          ? true
          : "Please select at least one expected value";
      },
    },
  });

  const inputRef = useRef<HTMLInputElement | null>();

  const [creatingCustomExpectedValue, setCreatingCustomExpectedValue] =
    useStateCallback(false);

  const customExpectedValueBuilderContextValue =
    useMemo((): CustomExpectedValueBuilderContextValue => {
      const closeCustomExpectedValueBuilder = () => {
        expectedValueSelectorFormMethods.setValue(
          "editingExpectedValueIndex",
          undefined,
        );
        expectedValueSelectorFormMethods.setValue(
          "customExpectedValueId",
          undefined,
        );
        expectedValueSelectorFormMethods.setValue(
          "flattenedCustomExpectedValueList",
          {},
        );

        setCreatingCustomExpectedValue(false, () => {
          inputRef.current?.focus();
        });
      };

      return {
        customExpectedValueBuilderOpen: creatingCustomExpectedValue,
        handleEdit: (index?: number, id?: string) => {
          expectedValueSelectorFormMethods.setValue(
            "flattenedCustomExpectedValueList",
            propertyTypeFormMethods.getValues(
              "flattenedCustomExpectedValueList",
            ),
          );
          expectedValueSelectorFormMethods.setValue(
            "editingExpectedValueIndex",
            index,
          );
          expectedValueSelectorFormMethods.setValue(
            "customExpectedValueId",
            id,
          );
          setCreatingCustomExpectedValue(true);
        },
        handleCancel: closeCustomExpectedValueBuilder,
        handleSave: () => {
          const [customExpectedValueId, editingExpectedValueIndex, newValues] =
            expectedValueSelectorFormMethods.getValues([
              "customExpectedValueId",
              "editingExpectedValueIndex",
              "flattenedCustomExpectedValueList",
            ]);

          const existingExpectedValues =
            propertyTypeFormMethods.getValues("expectedValues");

          if (!customExpectedValueId) {
            throw new Error("Cannot save if not editing");
          }

          const expectedValue = getExpectedValueDescriptor(
            customExpectedValueId,
            newValues,
          );

          const newExpectedValues = [...existingExpectedValues];

          if (editingExpectedValueIndex !== undefined) {
            newExpectedValues[editingExpectedValueIndex] = expectedValue;
          } else {
            newExpectedValues.push(expectedValue);
          }
          propertyTypeFormMethods.setValue(
            "expectedValues",
            newExpectedValues,
            { shouldDirty: true },
          );
          propertyTypeFormMethods.setValue(
            "flattenedCustomExpectedValueList",
            newValues,
            { shouldDirty: true },
          );
          closeCustomExpectedValueBuilder();
        },
      };
    }, [
      creatingCustomExpectedValue,
      expectedValueSelectorFormMethods,
      propertyTypeFormMethods,
      setCreatingCustomExpectedValue,
    ]);

  const { customExpectedValueBuilderOpen, handleEdit } =
    customExpectedValueBuilderContextValue;

  const creatingExpectedValue = useWatch({
    control: expectedValueSelectorFormMethods.control,
    name: "customExpectedValueId",
  });

  const [inputValue, setInputValue] = useState("");

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

  const { dataTypes, getExpectedValueDisplay } = useDataTypesOptions();
  const dataTypeOptions = dataTypes.map((option) => option.$id);

  return (
    <CustomExpectedValueBuilderContext.Provider
      value={customExpectedValueBuilderContextValue}
    >
      <FormProvider {...expectedValueSelectorFormMethods}>
        <Autocomplete
          disabled={!!creatingExpectedValue}
          open={autocompleteFocused || customExpectedValueBuilderOpen}
          PaperComponent={ExpectedValueSelectorDropdown}
          multiple
          popupIcon={null}
          clearIcon={null}
          forcePopupIcon={false}
          selectOnFocus={false}
          clearOnBlur={false}
          {...expectedValuesField}
          filterOptions={(options, { inputValue }) => {
            return options.filter((option) => {
              if (option === "object" || option === "array") {
                return option.includes(inputValue);
              }
              const dataType = dataTypes.find((dt) => dt.$id === option);
              if (!dataType) {
                return option.includes(inputValue);
              }
              const { description, title } = dataType;

              const leftLabel =
                "label" in dataType && "left" in dataType.label
                  ? dataType.label.left
                  : "";
              const rightLabel =
                "label" in dataType && "right" in dataType.label
                  ? dataType.label.right
                  : "";

              return (
                description.includes(inputValue) ||
                title.includes(inputValue) ||
                leftLabel.includes(inputValue) ||
                rightLabel.includes(inputValue)
              );
            });
          }}
          onFocus={() => {
            setAutocompleteFocused(true);
          }}
          onBlur={() => {
            expectedValuesField.onBlur();
            setAutocompleteFocused(false);
          }}
          onChange={(_evt, data, reason) => {
            if (reason !== "createOption") {
              expectedValuesField.onChange(data);
            }
            return false;
          }}
          inputValue={inputValue}
          onInputChange={(_evt, value, reason) => {
            if (reason !== "reset") {
              setInputValue(value);
            }
          }}
          freeSolo
          renderTags={(expectedValues, getTagProps) =>
            expectedValues.map((expectedValue, index) => {
              const typeId =
                typeof expectedValue === "object"
                  ? expectedValue.typeId
                  : expectedValue;

              const editable = typeId === "array" || typeId === "object";

              return (
                <ExpectedValueChip
                  {...getTagProps({ index })}
                  key={
                    typeof expectedValue === "object"
                      ? expectedValue.id
                      : expectedValue
                  }
                  expectedValueType={typeId}
                  editable={editable}
                  onEdit={() => {
                    if (typeof expectedValue === "object") {
                      handleEdit(index, expectedValue.id);
                    }
                  }}
                />
              );
            })
          }
          renderInput={(inputProps) => (
            <TextField
              {...inputProps}
              inputRef={inputRef}
              label="Expected values"
              placeholder="Select acceptable values"
              disabled={isSubmitting}
              error={!!expectedValuesError}
              success={expectedValuesValid}
              helperText={expectedValuesError?.message}
            />
          )}
          sx={{ width: "70%" }}
          options={dataTypeOptions}
          getOptionLabel={(opt) =>
            getExpectedValueDisplay(
              typeof opt === "object" ? opt.typeId : (opt as VersionedUrl),
            ).title
          }
          disableCloseOnSelect
          renderOption={(optProps, opt) => {
            const typeId = typeof opt === "object" ? opt.typeId : opt;

            return (
              <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                <FontAwesomeIcon
                  icon={{
                    icon: getExpectedValueDisplay(typeId).icon,
                  }}
                  sx={(theme) => ({ color: theme.palette.gray[50] })}
                />
                <Typography
                  variant="smallTextLabels"
                  component="span"
                  ml={1.5}
                  color={(theme) => theme.palette.gray[80]}
                >
                  {getExpectedValueDisplay(typeId).title}
                </Typography>
                <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
              </Box>
            );
          }}
          componentsProps={{
            popper: {
              className: fluidFontClassName,
              sx: { minWidth: 520 },
              placement: "bottom-start",
              modifiers: [
                {
                  name: "preventOverflow",
                  enabled: true,
                  options: {
                    altAxis: true,
                    rootBoundary: "viewport",
                    padding: 8,
                  },
                },
              ],
            },
          }}
        />
      </FormProvider>
    </CustomExpectedValueBuilderContext.Provider>
  );
};
