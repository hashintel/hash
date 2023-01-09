import {
  Button,
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { Autocomplete, Box, PaperProps, Typography } from "@mui/material";
import {
  forwardRef,
  ForwardRefRenderFunction,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FormProvider,
  useController,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { AutocompleteDropdown } from "../../../../../../shared/autocomplete-dropdown";
import { StyledPlusCircleIcon } from "../../../../../../shared/styled-plus-circle-icon";
import { useStateCallback } from "../../shared/use-state-callback";
import { dataTypeOptions } from "../shared/data-type-options";
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
import { expectedValuesOptions } from "./expected-value-selector/shared/expected-values-options";

const ExpectedValueSelectorDropdown = ({ children, ...props }: PaperProps) => {
  const {
    customExpectedValueBuilderOpen,
    openCustomExpectedValueBuilder,
    closeCustomExpectedValueBuilder,
    handleSave,
  } = useCustomExpectedValueBuilderContext();

  return (
    <AutocompleteDropdown {...props}>
      {customExpectedValueBuilderOpen ? (
        <CustomExpectedValueBuilder
          onCancel={closeCustomExpectedValueBuilder}
          onSave={handleSave}
        />
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
              openCustomExpectedValueBuilder();
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

const ExpectedValueSelector: ForwardRefRenderFunction<
  HTMLInputElement
> = () => {
  const propertyTypeFormMethods = useFormContext<PropertyTypeFormValues>();

  const expectedValueSelectorFormMethods =
    useForm<ExpectedValueSelectorFormValues>({
      defaultValues: {
        flattenedCustomExpectedValueList: {},
      },
      shouldFocusError: true,
      mode: "onBlur",
      reValidateMode: "onChange",
    });

  const { field: expectedValuesField } = useController({
    control: propertyTypeFormMethods.control,
    rules: { required: true },
    name: "expectedValues",
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
        openCustomExpectedValueBuilder: (index?: number, id?: string) => {
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
        closeCustomExpectedValueBuilder,
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
          propertyTypeFormMethods.setValue("expectedValues", newExpectedValues);
          propertyTypeFormMethods.setValue(
            "flattenedCustomExpectedValueList",
            newValues,
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

  const { customExpectedValueBuilderOpen, openCustomExpectedValueBuilder } =
    customExpectedValueBuilderContextValue;

  const creatingExpectedValue = useWatch({
    control: expectedValueSelectorFormMethods.control,
    name: "customExpectedValueId",
  });

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

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
          onFocus={() => {
            setAutocompleteFocused(true);
          }}
          onBlur={() => {
            expectedValuesField.onBlur();
            setAutocompleteFocused(false);
          }}
          onChange={(_evt, data) => {
            expectedValuesField.onChange(data);
          }}
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
                  key={typeId}
                  expectedValueType={
                    typeof expectedValue === "object" &&
                    "arrayType" in expectedValue
                      ? expectedValue.arrayType
                      : typeId
                  }
                  editable={editable}
                  onEdit={() => {
                    if (typeof expectedValue === "object") {
                      openCustomExpectedValueBuilder(index, expectedValue.id);
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
            />
          )}
          sx={{ width: "70%" }}
          options={dataTypeOptions}
          getOptionLabel={(opt) =>
            expectedValuesOptions[typeof opt === "object" ? opt.typeId : opt]!
              .title
          }
          disableCloseOnSelect
          renderOption={(optProps, opt) => {
            const typeId = typeof opt === "object" ? opt.typeId : opt;

            return (
              <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                <FontAwesomeIcon
                  icon={{ icon: expectedValuesOptions[typeId]!.icon }}
                  sx={(theme) => ({ color: theme.palette.gray[50] })}
                />
                <Typography
                  variant="smallTextLabels"
                  component="span"
                  ml={1.5}
                  color={(theme) => theme.palette.gray[80]}
                >
                  {expectedValuesOptions[typeId]!.title}
                </Typography>
                <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
              </Box>
            );
          }}
          componentsProps={{
            popper: {
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

const ExpectedValueSelectorForwardedRef = forwardRef(ExpectedValueSelector);

export { ExpectedValueSelectorForwardedRef as ExpectedValueSelector };
