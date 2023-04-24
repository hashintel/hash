import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  FormControl,
  formControlClasses,
  formHelperTextClasses,
  inputBaseClasses,
  outlinedInputClasses,
  Stack,
  styled,
} from "@mui/material";
import { FieldErrorsImpl, useFormContext } from "react-hook-form";

import { FontAwesomeIcon } from "../../fontawesome-icon";
import { IconButton } from "../../icon-button";
import { MenuItem } from "../../menu-item";
import { TextField } from "../../text-field";
import { fieldOperators, filterTypes } from "../constants";
import { FilterType, FormValues, PropertyFilter } from "../types";
import { RHFSelect } from "./rhf-select";

const StyledIcon = styled(FontAwesomeIcon)({
  marginRight: "8px !important",
});

interface FilterRowProps {
  index: number;
  onRemove: () => void;
  // value: FieldArrayWithId<FormValues, "filters", "id">;
}

const TypeSelector = ({ index }: { index: number }) => {
  const { control, setValue } = useFormContext<FormValues>();

  return (
    <FormControl>
      <RHFSelect
        control={control}
        name={`filters.${index}.type`}
        selectProps={{ size: "xs" }}
        rules={{
          onChange: (event: { target: { value: FilterType } }) => {
            const firstOperatorOfSelectedType =
              fieldOperators[event.target.value][0]!;

            setValue(
              `filters.${index}.operator`,
              firstOperatorOfSelectedType.operator,
              {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              },
            );
          },
        }}
      >
        {filterTypes.map(({ icon, type }) => (
          <MenuItem key={type} value={type}>
            <StyledIcon icon={{ icon }} />
            {type}
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};

const OperatorSelector = ({ index }: { index: number }) => {
  const { watch, control } = useFormContext<FormValues>();
  const watchedType = watch(`filters.${index}.type`);

  return (
    <FormControl>
      <RHFSelect
        control={control}
        name={`filters.${index}.operator`}
        selectProps={{ size: "xs" }}
      >
        {fieldOperators[watchedType].map(({ operator }) => (
          <MenuItem key={operator} value={operator}>
            {operator}
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};

const PropertySelector = ({ index }: { index: number }) => {
  const { control, formState } = useFormContext<FormValues>();

  const properties = [
    { title: "First name", id: "123" },
    { title: "Last name", id: "456" },
  ];

  const filterErrors = formState.errors.filters?.[index] as
    | FieldErrorsImpl<PropertyFilter>
    | undefined;

  const hasError = !!filterErrors?.propertyTypeId;

  return (
    <FormControl>
      <RHFSelect
        control={control}
        rules={{ required: "Required" }}
        defaultValue=""
        name={`filters.${index}.propertyTypeId`}
        selectProps={{ size: "xs", displayEmpty: true, error: hasError }}
      >
        <MenuItem value="" disabled noSelectBackground>
          Choose
        </MenuItem>
        {properties.map(({ title, id }) => (
          <MenuItem key={id} value={id}>
            {title}
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};

const ValueSelector = ({ index }: { index: number }) => {
  const { register, formState } = useFormContext<FormValues>();

  const errorMsg = formState.errors.filters?.[index]?.value?.message;

  /** @todo add type dropdown support */
  return (
    <TextField
      placeholder="value"
      {...register(`filters.${index}.value`, { required: "Required" })}
      error={!!errorMsg}
      helperText={errorMsg}
      size="xs"
    />
  );
};

const ChainOperatorSelector = () => {
  const { control } = useFormContext<FormValues>();

  return (
    <FormControl>
      <RHFSelect name="operator" control={control} selectProps={{ size: "xs" }}>
        <MenuItem value="AND">and</MenuItem>
        <MenuItem value="OR">or</MenuItem>
      </RHFSelect>
    </FormControl>
  );
};

export const FilterRow = ({ onRemove, index }: FilterRowProps) => {
  const { watch } = useFormContext<FormValues>();

  const chainOperator = watch("operator");
  const chainOperatorText = chainOperator === "AND" ? "and" : "or";

  const isFirstOne = index === 0;
  const isSecondOne = index === 1;

  const watchedType = watch(`filters.${index}.type`);
  const watchedOperator = watch(`filters.${index}.operator`);

  const watchedOperatorHasValue = fieldOperators[watchedType].find(
    (op) => op.operator === watchedOperator,
  )?.hasValue;

  return (
    <Stack direction="row" gap={1.5} sx={{ alignItems: "center" }}>
      <Box sx={{ width: 80 }}>
        {isFirstOne ? (
          "Where"
        ) : isSecondOne ? (
          <ChainOperatorSelector />
        ) : (
          chainOperatorText
        )}
      </Box>

      <Stack
        direction="row"
        sx={{
          "*": {
            boxShadow: "none !important",
          },

          [`.${formHelperTextClasses.root}`]: {
            position: "absolute",
            bottom: 0,
            transform: "translateY(100%)",
          },

          [`.${inputBaseClasses.root}`]: {
            borderRadius: 0,
            height: 38,
          },

          [`.${formControlClasses.root}`]: {
            [`.${outlinedInputClasses.focused}`]: {
              borderWidth: "6px",
            },

            [`:not(:last-child) .${outlinedInputClasses.notchedOutline}`]: {
              borderRight: "none",
            },

            [`:first-child .${inputBaseClasses.root}`]: {
              borderRadius: "6px 0 0 6px",
            },

            [`:last-child .${inputBaseClasses.root}`]: {
              borderRadius: "0 6px 6px 0",
            },
          },
        }}
      >
        <TypeSelector index={index} />
        {watchedType === "Property" && <PropertySelector index={index} />}
        <OperatorSelector index={index} />
        {watchedOperatorHasValue && <ValueSelector index={index} />}
      </Stack>

      <IconButton onClick={onRemove}>
        <FontAwesomeIcon icon={faClose} />
      </IconButton>
    </Stack>
  );
};
