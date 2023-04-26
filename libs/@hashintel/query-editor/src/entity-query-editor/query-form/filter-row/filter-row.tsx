import { EntityType, extractBaseUrl, PropertyType } from "@blockprotocol/graph";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  MenuItem,
  TextField,
} from "@hashintel/design-system";
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

import { FilterType, FormValues, PropertyFilter } from "../../../types";
import { fieldOperators, filterTypes } from "../../utils";
import { RHFSelect } from "./rhf-select";

const StyledIcon = styled(FontAwesomeIcon)({
  marginRight: "8px !important",
});

interface FilterRowProps {
  index: number;
  onRemove: () => void;
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
}

const TypeSelector = ({ index }: { index: number }) => {
  const { control, setValue } = useFormContext<FormValues>();

  return (
    <FormControl sx={{ width: 133 }}>
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
    <FormControl sx={{ minWidth: 117, flex: 1 }}>
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

const PropertyTypeSelector = ({
  index,
  propertyTypes,
}: {
  index: number;
  propertyTypes: PropertyType[];
}) => {
  const { control, formState } = useFormContext<FormValues>();

  const filterErrors = formState.errors.filters?.[index] as
    | FieldErrorsImpl<PropertyFilter>
    | undefined;

  const hasError = !!filterErrors?.propertyTypeBaseUrl;

  return (
    <FormControl>
      <RHFSelect
        control={control}
        rules={{ required: "Required" }}
        name={`filters.${index}.propertyTypeBaseUrl`}
        selectProps={{
          size: "xs",
          displayEmpty: true,
          error: hasError,
        }}
      >
        <MenuItem disabled noSelectBackground>
          Choose
        </MenuItem>
        {propertyTypes.map(({ title, $id }) => {
          const baseUrl = extractBaseUrl($id);

          /**
           * @todo baseUrl is probably going to be duplicated if there are multiple versions of the same property type, which is going to make these items non-unique.
           * we need to address the versioning of property types here.
           */
          return (
            <MenuItem key={baseUrl} value={baseUrl}>
              {title}
            </MenuItem>
          );
        })}
      </RHFSelect>
    </FormControl>
  );
};

const EntityTypeSelector = ({
  index,
  entityTypes,
}: {
  index: number;
  entityTypes: EntityType[];
}) => {
  const { control, formState } = useFormContext<FormValues>();

  const hasError = !!formState.errors.filters?.[index]?.value;

  return (
    <FormControl>
      <RHFSelect
        control={control}
        rules={{ required: "Required" }}
        defaultValue=""
        name={`filters.${index}.value`}
        selectProps={{
          size: "xs",
          displayEmpty: true,
          error: hasError,
        }}
      >
        <MenuItem value="" disabled noSelectBackground>
          Choose
        </MenuItem>
        {entityTypes.map(({ title, $id }) => (
          <MenuItem key={$id} value={$id}>
            {title}
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};

const ValueInput = ({ index }: { index: number }) => {
  const { register, formState } = useFormContext<FormValues>();

  const errorMsg = formState.errors.filters?.[index]?.value?.message;

  return (
    <TextField
      placeholder="filter value"
      {...register(`filters.${index}.value`, { required: "Required" })}
      error={!!errorMsg}
      helperText={errorMsg}
      size="xs"
      sx={{ width: 190 }}
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

export const FilterRow = ({
  onRemove,
  index,
  entityTypes,
  propertyTypes,
}: FilterRowProps) => {
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
    <Stack
      direction="row"
      gap={1.5}
      sx={{ alignItems: "center", fontSize: 14 }}
    >
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
          flex: 1,
          fieldset: {
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
            [`:not(:last-child) .${outlinedInputClasses.notchedOutline}`]: {
              borderRight: "none",
            },

            [`:first-of-type .${inputBaseClasses.root}`]: {
              borderRadius: "6px 0 0 6px",
            },

            [`:last-child .${inputBaseClasses.root}`]: {
              borderRadius: "0 6px 6px 0",
            },
          },
        }}
      >
        <TypeSelector index={index} />
        {watchedType === "Property" && (
          <PropertyTypeSelector index={index} propertyTypes={propertyTypes} />
        )}
        <OperatorSelector index={index} />
        {watchedOperatorHasValue &&
          (watchedType === "Type" ? (
            <EntityTypeSelector index={index} entityTypes={entityTypes} />
          ) : (
            <ValueInput index={index} />
          ))}
      </Stack>

      <IconButton onClick={onRemove}>
        <FontAwesomeIcon icon={faClose} />
      </IconButton>
    </Stack>
  );
};
