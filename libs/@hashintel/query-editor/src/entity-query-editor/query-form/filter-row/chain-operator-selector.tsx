import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { MenuItem } from "@hashintel/design-system";

import { useReadonlyContext } from "../../readonly-context";
import { RHFSelect } from "./rhf-select";

import type { FormValues } from "../../types";

export const ChainOperatorSelector = () => {
  const { control } = useFormContext<FormValues>();
  const readonly = useReadonlyContext();

  return (
    <FormControl>
      <RHFSelect name="operator" control={control} selectProps={{ size: "xs", disabled: readonly }}>
        <MenuItem value="AND">and</MenuItem>
        <MenuItem value="OR">or</MenuItem>
      </RHFSelect>
    </FormControl>
  );
};
