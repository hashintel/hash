import { TextField } from "@hashintel/design-system";
import { useFormContext } from "react-hook-form";

import { FormValues } from "../../types";

export const ValueInput = ({ index }: { index: number }) => {
  const { register, formState } = useFormContext<FormValues>();

  const errorMsg = formState.errors.filters?.[index]?.value?.message;

  return (
    <TextField
      {...register(`filters.${index}.value`, { required: "Required" })}
      placeholder="filter value"
      error={!!errorMsg}
      helperText={errorMsg}
      size="xs"
      sx={{ width: 190 }}
    />
  );
};
