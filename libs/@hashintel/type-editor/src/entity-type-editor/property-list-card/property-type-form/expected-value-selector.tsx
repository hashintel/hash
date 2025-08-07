import type {
  BaseUrl,
  DataType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  Button,
  Chip,
  DataTypeSelector,
  StyledPlusCircleIcon,
  TextField,
} from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing to use this package outside the repo
import { buildDataTypeTreesForSelector } from "@local/hash-isomorphic-utils/data-types";
// eslint-disable-next-line no-restricted-imports -- TODO needs fixing to use this package outside the repo
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Autocomplete, Paper, Typography } from "@mui/material";
import { useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useController,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { useOutsideClickRef } from "rooks";

import { useDataTypesOptions } from "../../../shared/data-types-options-context";
import { getExpectedValueDescriptor } from "../shared/get-expected-value-descriptor";
import type { PropertyTypeFormValues } from "../shared/property-type-form-values";
import { CustomExpectedValueBuilder } from "./expected-value-selector/custom-expected-value-builder";
import { ExpectedValueChip } from "./expected-value-selector/expected-value-chip";
import type { ExpectedValueSelectorContextValue } from "./expected-value-selector/shared/expected-value-selector-context";
import {
  ExpectedValueSelectorContext,
  useExpectedValueSelectorContext,
} from "./expected-value-selector/shared/expected-value-selector-context";
import type { ExpectedValueSelectorFormValues } from "./expected-value-selector/shared/expected-value-selector-form-values";

const ExpectedValueSelectorDropdown = () => {
  const {
    addDataType,
    autocompleteFocused,
    closeAutocomplete,
    customExpectedValueBuilderOpen,
    handleEdit,
    inputRef,
    searchText,
    selectedDataTypeIds,
    textFieldRef,
  } = useExpectedValueSelectorContext();

  const { dataTypes } = useDataTypesOptions();

  const dataTypeOptions = useMemo(() => {
    return buildDataTypeTreesForSelector({
      targetDataTypes: dataTypes.filter((dataType) =>
        dataType.allOf?.some(
          ({ $ref }) => $ref === blockProtocolDataTypes.value.dataTypeId,
        ),
      ),
      dataTypePoolById: dataTypes.reduce<Record<VersionedUrl, DataType>>(
        (acc, dataType) => {
          acc[dataType.$id] = dataType;
          return acc;
        },
        {},
      ),
    });
  }, [dataTypes]);

  const dataTypeSelectorMenuRef = useRef<HTMLDivElement>(null);

  const [paperRef] = useOutsideClickRef((event) => {
    if (!customExpectedValueBuilderOpen && event.target === inputRef.current) {
      return;
    }

    if (dataTypeSelectorMenuRef.current?.contains(event.target as Node)) {
      return;
    }

    closeAutocomplete();
  }, autocompleteFocused);

  return (
    <Paper
      ref={(el) => {
        setTimeout(() => {
          paperRef(el);
        }, 100);
      }}
    >
      {customExpectedValueBuilderOpen ? (
        <CustomExpectedValueBuilder />
      ) : (
        <DataTypeSelector
          additionalMenuContent={{
            height: 55,
            element: (
              <Button
                variant="tertiary"
                startIcon={<StyledPlusCircleIcon />}
                sx={{
                  width: "100%",
                  height: 55,
                  display: "flex",
                  alignItems: "center",
                  borderBottom: "none",
                  borderLeft: "none",
                  borderRight: "none",
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

                <Chip
                  color="purple"
                  label="PROPERTY TYPE"
                  sx={{ ml: 1.5, "& span": { fontSize: 12 } }}
                />
              </Button>
            ),
          }}
          allowSelectingAbstractTypes
          dataTypes={dataTypeOptions}
          externallyProvidedPopoverRef={dataTypeSelectorMenuRef}
          externalSearchInput={{
            focused: autocompleteFocused,
            inputRef: textFieldRef,
            searchText,
          }}
          hideHint
          onSelect={(dataTypeId) => {
            addDataType(dataTypeId);
          }}
          selectedDataTypeIds={selectedDataTypeIds}
        />
      )}
    </Paper>
  );
};

export const ExpectedValueSelector = ({
  propertyTypeBaseUrl,
}: {
  propertyTypeBaseUrl?: BaseUrl;
}) => {
  const propertyTypeFormMethods = useFormContext<PropertyTypeFormValues>();

  const selectedDataTypeIds = useWatch({
    control: propertyTypeFormMethods.control,
    name: "expectedValues",
  }).filter((value) => typeof value !== "object");

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
      validate: (value, formValues) => {
        for (const newValue of Object.values(
          formValues.flattenedCustomExpectedValueList,
        )) {
          const stillInExpectedValues = value.some((customValue) => {
            return (
              typeof customValue === "object" && customValue.id === newValue.id
            );
          });

          if (!stillInExpectedValues) {
            // The custom value has been removed from the expected values list
            continue;
          }

          if (newValue.data?.typeId === "array") {
            if (newValue.data.itemIds.length === 0) {
              return "Arrays must have at least one item";
            }
          }
          if (newValue.data?.typeId === "object") {
            if (newValue.data.properties.length === 0) {
              return "Objects must have at least one property";
            }
          }
        }

        setExpectedValuesValid(!!value.length);
        return value.length
          ? true
          : "Please select at least one expected value";
      },
    },
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const textFieldRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");

  const [creatingCustomExpectedValue, setCreatingCustomExpectedValue] =
    useState(false);

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

  const infrequentlyChangingContextValues = useMemo<
    Omit<
      ExpectedValueSelectorContextValue,
      "searchText" | "selectedDataTypeIds"
    >
  >(() => {
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

      setCreatingCustomExpectedValue(false);
    };

    return {
      addDataType: (dataTypeId: VersionedUrl) => {
        if (!expectedValuesField.value.includes(dataTypeId)) {
          expectedValuesField.onChange([
            ...expectedValuesField.value,
            dataTypeId,
          ]);
        }

        setInputValue("");
        setAutocompleteFocused(false);
      },
      autocompleteFocused,
      closeAutocomplete: () => {
        setAutocompleteFocused(false);
      },
      customExpectedValueBuilderOpen: creatingCustomExpectedValue,
      inputRef,
      textFieldRef,
      handleEdit: (index?: number, id?: string) => {
        expectedValueSelectorFormMethods.setValue(
          "flattenedCustomExpectedValueList",
          propertyTypeFormMethods.getValues("flattenedCustomExpectedValueList"),
        );
        expectedValueSelectorFormMethods.setValue(
          "editingExpectedValueIndex",
          index,
        );
        expectedValueSelectorFormMethods.setValue("customExpectedValueId", id);
        setCreatingCustomExpectedValue(true);
      },
      handleCancelCustomBuilder: () => {
        closeCustomExpectedValueBuilder();
      },
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
        propertyTypeFormMethods.setValue("expectedValues", newExpectedValues, {
          shouldDirty: true,
        });
        propertyTypeFormMethods.setValue(
          "flattenedCustomExpectedValueList",
          newValues,
          { shouldDirty: true },
        );
        closeCustomExpectedValueBuilder();

        setAutocompleteFocused(false);
      },
    };
  }, [
    autocompleteFocused,
    creatingCustomExpectedValue,
    expectedValuesField,
    expectedValueSelectorFormMethods,
    propertyTypeFormMethods,
    setCreatingCustomExpectedValue,
  ]);

  const expectedValueSelectorContextValue =
    useMemo((): ExpectedValueSelectorContextValue => {
      return {
        ...infrequentlyChangingContextValues,
        searchText: inputValue,
        selectedDataTypeIds,
      };
    }, [infrequentlyChangingContextValues, inputValue, selectedDataTypeIds]);

  const { customExpectedValueBuilderOpen, handleEdit } =
    expectedValueSelectorContextValue;

  const creatingExpectedValue = useWatch({
    control: expectedValueSelectorFormMethods.control,
    name: "customExpectedValueId",
  });

  return (
    <ExpectedValueSelectorContext.Provider
      value={expectedValueSelectorContextValue}
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
          }}
          onChange={(_evt, data, reason) => {
            if (reason !== "createOption") {
              expectedValuesField.onChange(data);
              setInputValue("");
            }
            return false;
          }}
          inputValue={inputValue}
          onInputChange={(_evt, value, reason) => {
            if (reason !== "reset") {
              setInputValue(value);
            }
          }}
          renderTags={(expectedValues, getTagProps) => {
            return expectedValues.map((expectedValue, index) => {
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
            });
          }}
          renderInput={(inputProps) => (
            <TextField
              {...inputProps}
              inputRef={inputRef}
              ref={textFieldRef}
              label="Expected values"
              placeholder="Select acceptable values"
              disabled={isSubmitting}
              error={!!expectedValuesError}
              success={expectedValuesValid}
              helperText={expectedValuesError?.message}
            />
          )}
          sx={{ width: "100%" }}
          options={[]}
          componentsProps={{
            popper: {
              className: fluidFontClassName,
              sx: { minWidth: 520 },
              placement: "bottom-start",
              modifiers: [
                {
                  name: "computeStyles",
                  enabled: true,
                },
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
    </ExpectedValueSelectorContext.Provider>
  );
};
