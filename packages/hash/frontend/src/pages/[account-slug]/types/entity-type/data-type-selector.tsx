import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { Autocomplete, Box, Typography } from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, useState } from "react";
import { useController, useWatch, useFormContext } from "react-hook-form";
import { PropertyTypeFormValues } from "./property-type-form";
import {
  PropertyTypeSelectorDropdown,
  usePropertyTypeSelectorDropdownContext,
} from "./property-type-selector-dropdown";
import { dataTypeData, dataTypeOptions } from "./property-type-utils";

const DataTypeSelector: ForwardRefRenderFunction<HTMLInputElement, {}> = () => {
  const { control } = useFormContext<PropertyTypeFormValues>();

  const {
    field: { onChange, onBlur, ...props },
  } = useController({
    control,
    rules: { required: true },
    name: "expectedValues",
  });

  const { customPropertyMenuOpen } = usePropertyTypeSelectorDropdownContext();

  const creatingProperty = useWatch({ control, name: "creatingPropertyId" });

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);

  return (
    <Autocomplete
      disabled={!!creatingProperty}
      open={autocompleteFocused || customPropertyMenuOpen}
      PaperComponent={PropertyTypeSelectorDropdown}
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
      renderTags={(value, getTagProps) =>
        value.map((opt, index) => {
          const typeId = typeof opt === "object" ? opt.typeId : opt;

          return (
            <Chip
              {...getTagProps({ index })}
              key={typeId}
              label={
                <Typography
                  variant="smallTextLabels"
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  <FontAwesomeIcon
                    icon={{
                      icon: dataTypeData[typeId]!.icon,
                    }}
                    sx={{ fontSize: "1em", mr: "1ch" }}
                  />
                  {dataTypeData[typeId]!.title}
                </Typography>
              }
              color="blue"
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
