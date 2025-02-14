import type {
  DataType,
  SingleValueConstraints,
  StringConstraints,
} from "@blockprotocol/type-system";
import { Tooltip, Typography } from "@mui/material";
import { Box, Stack } from "@mui/system";
import { useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";
import type { InheritedConstraints } from "./types";

const Constraint = ({ text, from }: { text: string; from?: DataType }) => {
  if (from) {
    return (
      <Tooltip title={<Box>Inherited from {from.title}</Box>}>
        <Box component="span" sx={{ fontWeight: 500, cursor: "help" }}>
          {text}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box component="span" sx={{ fontWeight: 500 }}>
      {text}
    </Box>
  );
};

export const StringConstraint = ({
  inheritedConstraints,
}: {
  inheritedConstraints: InheritedConstraints;
}) => {
  const { control } = useFormContext<DataTypeFormData>();

  const constraints = useWatch({ control, name: "constraints" });

  if (constraints.type !== "string") {
    throw new Error("String constraint expected");
  }

  const format =
    "format" in constraints
      ? constraints.format
      : inheritedConstraints.format?.value;

  return (
    <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
      {"It must be a "}
      <Constraint text="string" from={inheritedConstraints.type?.from} />
      {format && (
        <>
          {`, formatted as ${["uri", "email"].includes(format) ? "an" : "a"} `}
          <Constraint text={format} from={inheritedConstraints.format?.from} />
        </>
      )}
      .
    </Typography>
  );
};

export const HumanReadableExplanation = ({
  inheritedConstraints,
}: { inheritedConstraints: InheritedConstraints }) => {
  const { control } = useFormContext<DataTypeFormData>();

  const ownConstraints = useWatch({ control, name: "constraints" });

  const type = inheritedConstraints.type?.value ?? ownConstraints.type;

  console.log({ ownConstraints });

  switch (type) {
    case "string":
      return <StringConstraint inheritedConstraints={inheritedConstraints} />;
    default:
      return null;
  }
};
