import type { ExperimentParameterAxis } from "../../../../../../../react/experiments/parameter-grid";

export const parameterLabel = (axis: ExperimentParameterAxis): string => {
  if (axis.label) {
    return axis.label;
  }
  const words = axis.identifier
    .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
