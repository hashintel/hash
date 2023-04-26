import { EntityType } from "@blockprotocol/graph";
import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useFormContext } from "react-hook-form";

import { FormValues } from "../../types";
import { RHFSelect } from "./rhf-select";

export const EntityTypeSelector = ({
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
