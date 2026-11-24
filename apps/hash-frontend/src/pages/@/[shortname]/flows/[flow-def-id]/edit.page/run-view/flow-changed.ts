import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** A value as JSON with its keys sorted, leaving out where steps are drawn, which doesn't change what a flow does. */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "position")
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
};

const whatItDoes = ({ inputs, steps, outputs }: FlowDefinition<string>) =>
  JSON.stringify(canonicalize({ inputs, steps, outputs }));

/** Whether a flow's inputs, steps or outputs differ between two versions of it. Moving or renaming it doesn't count. */
export const flowChangedBetween = (
  before: FlowDefinition<string>,
  after: FlowDefinition<string>,
) => whatItDoes(before) !== whatItDoes(after);
