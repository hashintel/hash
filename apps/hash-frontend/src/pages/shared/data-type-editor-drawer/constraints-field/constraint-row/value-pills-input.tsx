import { Box } from "@mui/material";
import { useState } from "react";

import { TagsInput } from "@hashintel/ds-components";

/**
 * The permitted-values input: the ds TagsInput, with values parsed as numbers
 * when the constrained primitive is numeric — a commit that doesn't parse or
 * fails `isValueAllowed` is rejected and flags the field invalid until the
 * next successful change.
 */
export const ValuePillsInput = ({
  values,
  numeric,
  onChange,
  readonly,
  isValueAllowed,
}: {
  values: (string | number)[];
  numeric: boolean;
  onChange: (values: (string | number)[]) => void;
  readonly?: boolean;
  /** Rejects values the inherited constraints would drop on save */
  isValueAllowed?: (value: string | number) => boolean;
}) => {
  const [invalid, setInvalid] = useState(false);

  return (
    <Box sx={{ flex: 1, maxWidth: 420 }}>
      <TagsInput
        value={values.map(String)}
        onChange={(next) => {
          const parsed = numeric ? next.map(Number) : next;

          if (
            parsed.some(
              (value) => typeof value === "number" && !Number.isFinite(value),
            ) ||
            (isValueAllowed && !parsed.every(isValueAllowed))
          ) {
            setInvalid(true);
            return;
          }

          setInvalid(false);
          onChange(parsed.length > 0 ? parsed : []);
        }}
        readonly={readonly}
        invalid={invalid || undefined}
        placeholder={
          numeric ? "Type a number, press Enter" : "Type a value, press Enter"
        }
        aria-label="Add a permitted value"
        size="sm"
        width="fullWidth"
      />
    </Box>
  );
};
