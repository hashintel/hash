import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";
import { fieldOperators } from "./utils";

export const OperatorSelector = ({ index }: { index: number }) => {
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
