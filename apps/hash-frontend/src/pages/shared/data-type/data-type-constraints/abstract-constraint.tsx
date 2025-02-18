import { Checkbox, Stack, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";
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
            Users <ConstraintText text="may" /> create values of this data type.
          </>
        )}
      </Typography>
    </Stack>
  );
};
