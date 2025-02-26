import { createFormattedValueParts } from "@local/hash-isomorphic-utils/data-types";
import { Box, Stack, Typography } from "@mui/material";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "./data-type-form";
import { inputStyles } from "./shared/input-styles";
import { ItemLabel } from "./shared/item-label";
import { useInheritedConstraints } from "./shared/use-inherited-constraints";

export const DataTypeLabels = ({
  isReadOnly,
}: {
  isReadOnly: boolean;
}) => {
  const { control } = useFormContext<DataTypeFormData>();

  const inheritedConstraints = useInheritedConstraints();

  const type = useWatch({ control, name: "constraints.type" });
  const leftLabel = useWatch({ control, name: "label.left" });
  const rightLabel = useWatch({ control, name: "label.right" });

  const inheritedLeftLabel = inheritedConstraints.label?.left;
  const inheritedRightLabel = inheritedConstraints.label?.right;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- don't want empty strings
  const left = leftLabel || inheritedConstraints.label?.left?.value;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- don't want empty strings
  const right = rightLabel || inheritedConstraints.label?.right?.value;

  const leftLabelController = useController({
    control,
    name: "label.left",
    defaultValue: left,
  });
  const rightLabelController = useController({
    control,
    name: "label.right",
    defaultValue: right,
  });

  if (type !== "number" || (isReadOnly && !left && !right)) {
    return null;
  }

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Display
      </Typography>
      <Typography
        variant="smallTextParagraphs"
        sx={{
          fontSize: 13,
          color: ({ palette }) => palette.gray[80],
        }}
      >
        Values can be labelled with units, e.g.{" "}
        <Box component="span" sx={{ fontWeight: 600 }}>
          km
        </Box>
        .
      </Typography>
      {left || right ? (
        <Typography
          component="p"
          variant="smallTextParagraphs"
          sx={{
            fontSize: 13,
            color: ({ palette }) => palette.gray[80],
          }}
        >
          <Box component="span">
            {"A value of 100 for this data type would be displayed as: "}
          </Box>
          {createFormattedValueParts({
            inner: "100",
            schema: { label: { left, right } },
          }).map((part) => (
            <Box
              component="span"
              key={part.text}
              sx={{ color: part.color, fontWeight: 400 }}
            >
              {part.text}
            </Box>
          ))}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={2} mt={2}>
        <Box>
          <ItemLabel
            tooltip={
              <Box>
                The label to display before the value.
                <br />
                {inheritedLeftLabel
                  ? ` Parent type ${inheritedLeftLabel.from.title} has a label of ${inheritedLeftLabel.value} – this may be overridden.`
                  : ""}
              </Box>
            }
          >
            Left label
          </ItemLabel>
          <Box
            component="input"
            {...leftLabelController.field}
            disabled={isReadOnly}
            sx={[inputStyles, { width: 80 }]}
          />
        </Box>
        <Box>
          <ItemLabel
            tooltip={
              <Box>
                The label to display after the value.
                <br />
                {inheritedRightLabel
                  ? ` Parent type ${inheritedRightLabel.from.title} has a label of ${inheritedRightLabel.value} – this may be overridden.`
                  : ""}
              </Box>
            }
          >
            Right label
          </ItemLabel>
          <Box
            component="input"
            {...rightLabelController.field}
            disabled={isReadOnly}
            sx={[inputStyles, { width: 80 }]}
          />
        </Box>
      </Stack>
    </Box>
  );
};
