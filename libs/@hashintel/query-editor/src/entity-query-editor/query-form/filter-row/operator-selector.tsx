import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../../readonly-context";
import type { FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";
import { fieldOperators } from "./utils";

export const OperatorSelector = ({ index }: { index: number }) => {
  const { watch, control } = useFormContext<FormValues>();
  const watchedType = watch(`filters.${index}.type`);
  const readonly = useReadonlyContext();

  return (
    <FormControl sx={{ minWidth: 117, flex: 1 }}>
      <RHFSelect
        control={control}
        name={`filters.${index}.operator`}
        selectProps={{ size: "xs", disabled: readonly }}
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
