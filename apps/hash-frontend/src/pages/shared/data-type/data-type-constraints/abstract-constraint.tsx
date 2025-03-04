import { Checkbox, Stack, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";
import { ItemLabel } from "../shared/item-label";
import { ConstraintText } from "./shared/constraint-text";

export const AbstractConstraint = ({
  isReadOnly,
}: {
  isReadOnly: boolean;
}) => {
  const { control, setValue } = useFormContext<DataTypeFormData>();

  const abstract = useWatch({ control, name: "abstract" });

  if (isReadOnly && !abstract) {
    return null;
  }

  return (
    <Stack mt={2} gap={1}>
      <ItemLabel tooltip="You can disable assigning a data type directly to a property. This is useful if you want to create a parent type which isn't suitable for direct use (e.g. 'Length' can't be used directly, because 'Length: 4' doesn't make sense).">
        {abstract ? "Not assignable" : "Assignable"}
      </ItemLabel>
      <Stack
        direction="row"
        gap={1}
        component={isReadOnly ? "div" : "label"}
        sx={{ cursor: isReadOnly ? "default" : "pointer" }}
      >
        {!isReadOnly && (
          <Checkbox
            checked={!abstract}
            onChange={(event) => setValue("abstract", !event.target.checked)}
            sx={{
              svg: {
                width: 13,
                height: 13,
              },
            }}
          />
        )}
        <Typography
          variant="smallTextParagraphs"
          sx={{ fontWeight: 300, fontSize: 13 }}
        >
          {abstract ? (
            <>
              Users <ConstraintText text="cannot" /> create values of this data
              type: its children must be assigned to properties instead.
            </>
          ) : (
            <>
              Users <ConstraintText text="may" /> create values of this data
              type.
            </>
          )}
        </Typography>
      </Stack>
    </Stack>
  );
};
