import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../../readonly-context";
import type { FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";

export const ChainOperatorSelector = () => {
  const { control } = useFormContext<FormValues>();
  const readonly = useReadonlyContext();

  return (
    <FormControl>
      <RHFSelect
        name="operator"
        control={control}
        selectProps={{ size: "xs", disabled: readonly }}
      >
        <MenuItem value="AND">and</MenuItem>
        <MenuItem value="OR">or</MenuItem>
      </RHFSelect>
    </FormControl>
  );
};
