/**
 * Centralized icon definitions for Petri net entity types.
 *
 * Each entity has an outline icon (used in PropertiesPanel headers)
 * and optionally a filled icon (used in list item rows).
 */
import { Icon, type IconName } from "@hashintel/ds-components";

type IconSize = "xxs" | "xs" | "sm" | "md" | "lg";

const sizeToIconSize = (size: number): IconSize => {
  if (size <= 9) {
    return "xxs";
  }
  if (size <= 13) {
    return "xs";
  }
  if (size <= 19) {
    return "sm";
  }
  if (size <= 27) {
    return "md";
  }
  return "lg";
};

const makeIcon =
  (name: IconName) =>
  ({ size }: { size: number }) => <Icon name={name} size={sizeToIconSize(size)} />;

/** Outline icons — used in PropertiesPanel headers */
export const PlaceIcon = makeIcon("circleFilled");
export const TransitionIcon = makeIcon("squareFilled");
export const ParameterIcon = makeIcon("sliders");
export const TokenTypeIcon = makeIcon("threeCircles");
export const DifferentialEquationIcon = makeIcon("function");

/** Filled icons — used in list item rows */
export const PlaceFilledIcon = makeIcon("circleFilled");
export const TransitionFilledIcon = makeIcon("squareFilled");
