import { lowerCase, upperFirst } from "lodash";

/** An input or output's name as people read it, e.g. `entityTypeIds` as "Entity type ids". */
export const getNameLabel = (name: string) => upperFirst(lowerCase(name));

/** Outputs that read other than by their name, by action: If sends its value to Yes or No. */
const outputLabels: Partial<Record<string, Record<string, string>>> = {
  if: { true: "Yes", false: "No" },
};

/** A step's output as people read it, e.g. If's `true` as "Yes". `actionDefinitionId` is `undefined` for a for-each step. */
export const getOutputLabel = (
  actionDefinitionId: string | undefined,
  outputName: string,
) =>
  (actionDefinitionId === undefined
    ? undefined
    : outputLabels[actionDefinitionId]?.[outputName]) ??
  getNameLabel(outputName);
