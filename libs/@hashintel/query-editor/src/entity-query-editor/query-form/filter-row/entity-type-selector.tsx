import type { EntityType } from "@blockprotocol/graph";
import { MenuItem, OntologyChip } from "@hashintel/design-system";
import { FormControl, listClasses } from "@mui/material";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../../readonly-context";
import type { FormValues } from "../../types";
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
          MenuProps: {
            sx: {
              [`& .${listClasses.root}`]: {
                maxWidth: 600,
              },
            },
          },
        }}
      >
        <MenuItem value="" disabled noSelectBackground>
          Choose
        </MenuItem>
        {sortedEntityTypes.map(({ title, $id }) => (
          <MenuItem key={$id} value={$id} sx={{}}>
            {title}
            <OntologyChip
              domain={new URL($id).hostname}
              path={new URL($id).pathname}
              sx={{ marginLeft: 2 }}
            />
          </MenuItem>
        ))}
      </RHFSelect>
    </FormControl>
  );
};
