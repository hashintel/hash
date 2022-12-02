import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import { Autocomplete, Box, Typography } from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, useState } from "react";
import { useController, useWatch, useFormContext } from "react-hook-form";
import {
  DataTypeSelectorDropdown,
  useDataTypeSelectorDropdownContext,
} from "./data-type-selector-dropdown";
import { ExpectedValueChip } from "./expected-value-chip";
import { PropertyTypeFormValues } from "./property-type-form";

import {
  ArrayType,
  dataTypeData,
  dataTypeOptions,
} from "./property-type-utils";

const DataTypeSelector: ForwardRefRenderFunction<HTMLInputElement, {}> = () => {
  const { control, setValue } = useFormContext<PropertyTypeFormValues>();

  const {
    field: { onChange, onBlur, ...props },
  } = useController({
    control,
    rules: { required: true },
    name: "expectedValues",
  });

  const { customDataTypeMenuOpen, openCustomDataTypeMenu } =
    useDataTypeSelectorDropdownContext();

  const creatingProperty = useWatch({ control, name: "customDataTypeId" });

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

  return (
    <Autocomplete
      disabled={!!creatingProperty}
      open={autocompleteFocused || customDataTypeMenuOpen}
      PaperComponent={DataTypeSelectorDropdown}
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
                  setValue("editingDataTypeIndex", index);
                  setValue("customDataTypeId", expectedValue.id);
                  setValue(
                    "flattenedDataTypeList",
                    expectedValue.flattenedDataTypes,
                  );
                  openCustomDataTypeMenu();
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
          sx={{
            alignSelf: "flex-start",
            width: "70%",
          }}
          placeholder="Select acceptable values"
        />
      )}
      options={dataTypeOptions}
      getOptionLabel={(opt) =>
        dataTypeData[typeof opt === "object" ? opt.typeId : opt]!.title
      }
      disableCloseOnSelect
      renderOption={(optProps, opt) => {
        const typeId = typeof opt === "object" ? opt.typeId : opt;

        return (
          <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
            <FontAwesomeIcon
              icon={{ icon: dataTypeData[typeId]!.icon }}
              sx={(theme) => ({ color: theme.palette.gray[50] })}
            />
            <Typography
              variant="smallTextLabels"
              component="span"
              ml={1.5}
              color={(theme) => theme.palette.gray[80]}
            >
              {dataTypeData[typeId]!.title}
            </Typography>
            <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
          </Box>
        );
      }}
      componentsProps={{
        popper: {
          sx: { minWidth: 520 },
          placement: "auto-start",
        },
      }}
    />
  );
};

const DataTypeSelectorForwardedRef = forwardRef(DataTypeSelector);

export { DataTypeSelectorForwardedRef as DataTypeSelector };
