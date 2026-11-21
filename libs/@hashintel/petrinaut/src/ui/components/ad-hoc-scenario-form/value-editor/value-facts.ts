import { adHocSlotKey } from "@hashintel/petrinaut-core";

import type { AdHocFormFacts } from "../form-context";
import type {
  AdHocValuePart,
  AdHocValueTarget,
} from "@hashintel/petrinaut-core";

/**
 * What the form knows about one value and no other: its path, whether the
 * focused value reads it, its errors and, for a read-only value, the
 * expression it was computed from. A record of strings and booleans, for
 * `sameParts` to compare.
 */
export const valueFacts = (
  facts: AdHocFormFacts,
  target: AdHocValueTarget,
  { optimized, readOnly }: { optimized: boolean; readOnly: boolean },
) => {
  const errorOf = (part: AdHocValuePart) => facts.errorFor({ target, part });
  return {
    label: facts.labelFor(target),
    dependencyHighlighted: facts.highlight.slotKeys.has(
      adHocSlotKey({ target, part: "expression" }),
    ),
    expressionError: errorOf("expression"),
    // The bounds of an interval take errors only while the interval is on.
    minError: optimized ? errorOf("min") : undefined,
    maxError: optimized ? errorOf("max") : undefined,
    stepError: optimized ? errorOf("step") : undefined,
    sourceExpression: readOnly ? facts.expressionFor(target) : undefined,
  };
};
