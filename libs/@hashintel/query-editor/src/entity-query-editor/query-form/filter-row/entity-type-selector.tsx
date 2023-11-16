import { EntityType } from "@blockprotocol/graph";
import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../../readonly-context";
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
  const readonly = useReadonlyContext();

  const hasError = !!formState.errors.filters?.[index]?.value;

  const sortedEntityTypes = useMemo(
    () => entityTypes.sort((a, b) => a.title.localeCompare(b.title)),
    [entityTypes],
  );

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
          disabled: readonly,
        }}
      >
        <MenuItem value="" disabled noSelectBackground>
          Choose
        </MenuItem>
        {sortedEntityTypes.map(({ title, $id }) => (
          <MenuItem key={$id} value={$id}>
            {title}
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};
