import { faClose } from "@fortawesome/free-solid-svg-icons";
import { Box, Stack, styled } from "@mui/material";
import { FieldArrayWithId, useFormContext } from "react-hook-form";

import { FontAwesomeIcon } from "../../fontawesome-icon";
import { IconButton } from "../../icon-button";
import { MenuItem } from "../../menu-item";
import { TextField } from "../../text-field";
import { fieldOperators, filterTypes } from "../constants";
import { FilterType, FormValues } from "../types";
import { RHFSelect } from "./rhf-select";

const StyledIcon = styled(FontAwesomeIcon)({
  marginRight: "8px !important",
});

interface FilterRowProps {
  index: number;
  onRemove: () => void;
  value: FieldArrayWithId<FormValues, "filters", "id">;
}

const TypeSelector = ({ index }: { index: number }) => {
  const form = useFormContext<FormValues>();

  return (
    <RHFSelect
      control={form.control}
      name={`filters.${index}.type`}
      selectProps={{ size: "xs" }}
      rules={{
        onChange: (event: { target: { value: FilterType } }) => {
          const firstOperatorOfSelectedType =
            fieldOperators[event.target.value][0]!;

          form.setValue(
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
  );
};

const OperatorSelector = ({ index }: { index: number }) => {
  const form = useFormContext<FormValues>();
  const watchedType = form.watch(`filters.${index}.type`);

  return (
    <RHFSelect
      control={form.control}
      name={`filters.${index}.operator`}
      selectProps={{ size: "xs", displayEmpty: true }}
    >
      {fieldOperators[watchedType].map(({ operator }) => (
        <MenuItem key={operator} value={operator}>
          {operator}
        </MenuItem>
      ))}
    </RHFSelect>
  );
};

const ValueSelector = ({ index }: { index: number }) => {
  const form = useFormContext<FormValues>();

  /** @todo add type dropdown support */

  return (
    <TextField
      placeholder="value"
      {...form.register(`filters.${index}.value`)}
      size="xs"
    />
  );
};

const ChainOperatorSelector = () => {
  const form = useFormContext<FormValues>();

  return (
    <RHFSelect
      name="operator"
      control={form.control}
      selectProps={{ size: "xs" }}
    >
      <MenuItem value="AND">and</MenuItem>
      <MenuItem value="OR">or</MenuItem>
    </RHFSelect>
  );
};

export const FilterRow = ({ value, onRemove, index }: FilterRowProps) => {
  const form = useFormContext<FormValues>();

  const chainOperator = form.watch("operator");
  const chainOperatorText = chainOperator === "AND" ? "and" : "or";

  const isFirstOne = index === 0;
  const isSecondOne = index === 1;

  const watchedType = form.watch(`filters.${index}.type`);
  const watchedOperator = form.watch(`filters.${index}.operator`);

  const watchedOperatorHasValue = fieldOperators[watchedType].find(
    (op) => op.operator === watchedOperator,
  )?.hasValue;

  return (
    <Stack direction="row" gap={1.5}>
      <Box sx={{ width: 80 }}>
        {isFirstOne ? (
          "Where"
        ) : isSecondOne ? (
          <ChainOperatorSelector />
        ) : (
          chainOperatorText
        )}
      </Box>

      <Stack direction="row">
        <TypeSelector index={index} />
        <OperatorSelector index={index} />
        {watchedOperatorHasValue && <ValueSelector index={index} />}
      </Stack>

      <IconButton onClick={onRemove}>
        <FontAwesomeIcon icon={faClose} />
      </IconButton>
    </Stack>
  );
};
