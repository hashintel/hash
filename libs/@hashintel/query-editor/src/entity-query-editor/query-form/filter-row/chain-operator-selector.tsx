import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";

export const ChainOperatorSelector = () => {
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
