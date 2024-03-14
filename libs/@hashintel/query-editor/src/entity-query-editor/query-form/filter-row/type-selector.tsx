import { FontAwesomeIcon, MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../../readonly-context";
import type { FilterType, FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";
import { fieldOperators, filterTypes } from "./utils";

export const TypeSelector = ({ index }: { index: number }) => {
  const { control, setValue } = useFormContext<FormValues>();
  const readonly = useReadonlyContext();

  return (
    <FormControl sx={{ width: 133 }}>
      <RHFSelect
        control={control}
        name={`filters.${index}.type`}
        selectProps={{ size: "xs", disabled: readonly }}
        rules={{
          onChange: (event: { target: { value: FilterType } }) => {
            const firstOperatorOfSelectedType =
              fieldOperators[event.target.value][0]!;

            setValue(`filters.${index}.value`, "");

            setValue(
              `filters.${index}.operator`,
              firstOperatorOfSelectedType.operator,
            );
          },
        }}
      >
        {filterTypes.map(({ icon, type }) => (
          <MenuItem key={type} value={type}>
            <FontAwesomeIcon sx={{ mr: 1 }} icon={{ icon }} />
            {type}
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};
