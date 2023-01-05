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
import { useController, useFormContext, useWatch } from "react-hook-form";

import { AutocompleteDropdown } from "../../../../../../../shared/autocomplete-dropdown";
import { StyledPlusCircleIcon } from "../../../../../../../shared/styled-plus-circle-icon";
import { PropertyTypeFormValues } from "../property-type-form-values";
import { CustomExpectedValueBuilder } from "./expected-value-selector/custom-expected-value-builder";
import { ExpectedValueChip } from "./expected-value-selector/expected-value-chip";
import {
  CustomExpectedValueBuilderContext,
  useCustomExpectedValueBuilderContext,
} from "./expected-value-selector/shared/custom-expected-value-builder-context";
import { expectedValuesOptions } from "./expected-value-selector/shared/expected-values-options";
import { dataTypeOptions } from "./shared/data-type-options";

const ExpectedValueSelectorDropdown = ({ children, ...props }: PaperProps) => {
  const {
    customExpectedValueBuilderOpen,
    openCustomExpectedValueBuilder,
    closeCustomExpectedValueBuilder,
  } = useCustomExpectedValueBuilderContext();

  return (
    <AutocompleteDropdown {...props}>
      {customExpectedValueBuilderOpen ? (
        <CustomExpectedValueBuilder
          closeMenu={closeCustomExpectedValueBuilder}
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
            onClick={openCustomExpectedValueBuilder}
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
  HTMLInputElement,
  {}
> = () => {
  const { control, setValue, clearErrors } =
    useFormContext<PropertyTypeFormValues>();

  const [expectedValuesValid, setExpectedValuesValid] = useState(false);

  const {
    field: { onChange, onBlur, ...props },
    formState: {
      isSubmitting,
      errors: { expectedValues: expectedValuesError },
    },
  } = useController({
    control,
    name: "expectedValues",
    rules: {
      onChange() {
        clearErrors("expectedValues");
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
    useState(false);

  const customExpectedValueBuilderContextValue = useMemo(
    () => ({
      customExpectedValueBuilderOpen: creatingCustomExpectedValue,
      openCustomExpectedValueBuilder: () =>
        setCreatingCustomExpectedValue(true),
      closeCustomExpectedValueBuilder: () => {
        setValue("editingExpectedValueIndex", undefined);
        setValue("customExpectedValueId", undefined);
        setValue("flattenedCustomExpectedValueList", {});
        setCreatingCustomExpectedValue(false);

        // Using setImmediate because the autocomplete input is disabled when
        // creatingCustomExpectedValue is false and can't be focused until it
        // is set to true
        setImmediate(() => {
          inputRef.current?.focus();
        });
      },
    }),
    [creatingCustomExpectedValue, setCreatingCustomExpectedValue, setValue],
  );

  const { customExpectedValueBuilderOpen, openCustomExpectedValueBuilder } =
    customExpectedValueBuilderContextValue;

  const creatingExpectedValue = useWatch({
    control,
    name: "customExpectedValueId",
  });

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

  return (
    <CustomExpectedValueBuilderContext.Provider
      value={customExpectedValueBuilderContextValue}
    >
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
                    setValue("editingExpectedValueIndex", index);
                    setValue("customExpectedValueId", expectedValue.id);
                    setValue(
                      "flattenedCustomExpectedValueList",
                      expectedValue.flattenedExpectedValues,
                    );
                    openCustomExpectedValueBuilder();
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
    </CustomExpectedValueBuilderContext.Provider>
  );
};

const ExpectedValueSelectorForwardedRef = forwardRef(ExpectedValueSelector);

export { ExpectedValueSelectorForwardedRef as ExpectedValueSelector };
