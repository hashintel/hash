import { Box } from "@mui/material";
import { useState, useSyncExternalStore } from "react";

import { TagsInput } from "@hashintel/ds-components";

import {
  patternVerdictsVersion,
  subscribeToPatternVerdicts,
} from "../../untrusted-pattern-oracle";

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
  isValueAllowed,
}: {
  values: (string | number)[];
  numeric: boolean;
  onChange: (values: (string | number)[]) => void;
  /** Rejects values the inherited constraints would drop on save */
  isValueAllowed?: (value: string | number) => boolean;
}) => {
  const [invalid, setInvalid] = useState(false);

  // Inherited-pattern checks run in the oracle's worker — re-render as its
  // verdicts land so the flag below picks them up
  useSyncExternalStore(
    subscribeToPatternVerdicts,
    patternVerdictsVersion,
    patternVerdictsVersion,
  );

  // Committed pills can fall out of bounds after the fact — inherited
  // constraints tighten when the parent changes — so the field stays
  // flagged until they're removed
  const committedInvalid =
    isValueAllowed !== undefined &&
    values.some((value) => !isValueAllowed(value));

  return (
    <Box sx={{ flex: 1, maxWidth: 420 }}>
      <TagsInput
        value={values.map(String)}
        onChange={(next) => {
          // Whitespace-only input would coerce to 0 — treat it as unparsable
          const parsed = numeric
            ? next.map((value) =>
                value.trim() === "" ? Number.NaN : Number(value),
              )
            : next;

          // Equivalent numeric spellings ("1", "1.0") collapse to one value —
          // the string-level duplicate check upstream can't catch them
          const hasDuplicate =
            numeric && new Set<string | number>(parsed).size !== parsed.length;

          // Only newly added values are screened — a removal must always
          // commit, or out-of-bounds pills could never be cleared while
          // another one remained
          const committed = new Set(values.map(String));
          const added = parsed.filter((value) => !committed.has(String(value)));

          if (
            hasDuplicate ||
            added.some(
              (value) => typeof value === "number" && !Number.isFinite(value),
            ) ||
            (isValueAllowed && !added.every(isValueAllowed))
          ) {
            setInvalid(true);
            return;
          }

          setInvalid(false);
          onChange(parsed.length > 0 ? parsed : []);
        }}
        invalid={invalid || committedInvalid || undefined}
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
