import { TextField } from "@hashintel/design-system";
import { useFormContext } from "react-hook-form";

import { FormValues } from "../../types";

export const ValueInput = ({ index }: { index: number }) => {
  const { register, formState, watch } = useFormContext<FormValues>();

  const errorMsg = formState.errors.filters?.[index]?.value?.message;

  const valueType = watch(`filters.${index}.valueType`);

  if (valueType === "boolean") {
    return (
      <TextField
        type="checkbox"
        InputProps={{
          sx: { px: 1 },
        }}
        {...register(`filters.${index}.value`, {
          required: false,
          setValueAs: (value) => !!value,
        })}
      />
    );
  }

  if (valueType === "string" || valueType === "number") {
    const isNumber = valueType === "number";
    return (
      <TextField
        {...register(`filters.${index}.value`, {
          required: "Required",
          valueAsNumber: isNumber,
        })}
        placeholder="filter value"
        error={!!errorMsg}
        helperText={errorMsg}
        size="xs"
        sx={{ width: 190 }}
        InputProps={{
          inputMode: isNumber ? "numeric" : "text",
          type: isNumber ? "number" : "text",
        }}
      />
    );
  }

  return null;
};
