import {
  Button,
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/ontology-types";
import { Autocomplete, Box, PaperProps, Typography } from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";
import { AutocompleteDropdown } from "../../../../../../../shared/autocomplete-dropdown";
import {
  ArrayType,
  PropertyTypeFormValues,
} from "../property-type-form-values";
import { ExpectedValueChip } from "./data-type-selector/expected-value-chip";
import { expectedValuesOptions } from "./data-type-selector/shared/expected-values-options";
import { dataTypeOptions } from "./shared/data-type-options";

import { StyledPlusCircleIcon } from "../../../../../../../shared/styled-plus-circle-icon";
import { useCustomExpectedValueBuilderContext } from "./shared/custom-expected-value-builder-context";
import { CustomExpectedValueBuilder } from "./data-type-selector/custom-expected-value-builder";

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
  const { control, setValue } = useFormContext<PropertyTypeFormValues>();

  const {
    field: { onChange, onBlur, ...props },
  } = useController({
    control,
    rules: { required: true },
    name: "expectedValues",
  });

  const { customExpectedValueBuilderOpen, openCustomExpectedValueBuilder } =
    useCustomExpectedValueBuilderContext();

  const creatingExpectedValue = useWatch({
    control,
    name: "customExpectedValueId",
  });

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

  return (
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
              ? expectedValue.arrayType
              : expectedValue;

          const editable =
            typeId in ArrayType || typeId === types.dataType.object.dataTypeId;

          return (
            <ExpectedValueChip
              {...getTagProps({ index })}
              key={typeId}
              expectedValueType={typeId}
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
          label="Expected values"
          placeholder="Select acceptable values"
        />
      )}
      sx={{ width: "70%" }}
      options={dataTypeOptions}
      getOptionLabel={(opt) =>
        expectedValuesOptions[typeof opt === "object" ? opt.typeId : opt]!.title
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
  );
};

const ExpectedValueSelectorForwardedRef = forwardRef(ExpectedValueSelector);

export { ExpectedValueSelectorForwardedRef as ExpectedValueSelector };
