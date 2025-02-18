import { Stack, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";

import { AbstractConstraint } from "./data-type-constraints/abstract-constraint";
import { NumberConstraints } from "./data-type-constraints/number-constraints";
import { ConstraintText } from "./data-type-constraints/shared/constraint-text";
import { ItemLabel } from "./data-type-constraints/shared/item-label";
import { StringConstraints } from "./data-type-constraints/string-constraints";
import type { InheritedConstraints } from "./data-type-constraints/types";
import type { DataTypeFormData } from "./data-type-form";
import { useInheritedConstraints } from "./use-inherited-constraints";

const Constraint = ({
  inheritedConstraints,
  isReadOnly,
  type,
}: {
  inheritedConstraints: InheritedConstraints;
  isReadOnly: boolean;
  type: "string" | "number" | "boolean" | "null" | "array" | "object";
}) => {
  switch (type) {
    case "string":
      return (
        <StringConstraints
          inheritedConstraints={inheritedConstraints}
          isReadOnly={isReadOnly}
        />
      );
    case "number":
      return (
        <NumberConstraints
          inheritedConstraints={inheritedConstraints}
          isReadOnly={isReadOnly}
        />
      );
    default:
      return (
        <Typography variant="smallTextParagraphs">
          It must be{" "}
          <ConstraintText
            text={
              type === "object" || type === "array"
                ? `an ${type}`
                : type === "null"
                  ? "null"
                  : `a ${type}`
            }
          />
        </Typography>
      );
  }
};

export const DataTypeConstraints = ({
  isReadOnly,
}: {
  isReadOnly: boolean;
}) => {
  const { control } = useFormContext<DataTypeFormData>();

  const inheritedConstraints = useInheritedConstraints();

  const ownConstraints = useWatch({ control, name: "constraints" });

  const type = inheritedConstraints.type?.value ?? ownConstraints.type;

  return (
    <Stack gap={1}>
      <Constraint
        inheritedConstraints={inheritedConstraints}
        isReadOnly={isReadOnly}
        type={type}
      />
      <Stack mt={1} gap={1}>
        <ItemLabel tooltip="You can disable assigning a data type directly to a property. This is useful if you want to create a parent type which isn't suitable for direct use (e.g. 'Length' can't be used directly, because 'Length: 4' doesn't make sense).">
          Assignable
        </ItemLabel>
        <AbstractConstraint isReadOnly={isReadOnly} />
      </Stack>
    </Stack>
  );
};
