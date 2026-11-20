/**
 * The icon of each kind of Petri net entity, as the properties headers, the
 * entity lists and the notebook cells show it.
 */
import { Icon } from "@hashintel/ds-components";

type IconSize = "xxs" | "xs" | "sm" | "md" | "lg";

interface EntityIconProps {
  /** In pixels; the icon takes the nearest size of the design system. */
  size: number;
}

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

export const PlaceIcon = ({ size }: EntityIconProps) => (
  <Icon name="circleFilled" size={sizeToIconSize(size)} />
);

export const TransitionIcon = ({ size }: EntityIconProps) => (
  <Icon name="squareFilled" size={sizeToIconSize(size)} />
);

export const ParameterIcon = ({ size }: EntityIconProps) => (
  <Icon name="sliders" size={sizeToIconSize(size)} />
);

export const TokenTypeIcon = ({ size }: EntityIconProps) => (
  <Icon name="threeCircles" size={sizeToIconSize(size)} />
);

export const DifferentialEquationIcon = ({ size }: EntityIconProps) => (
  <Icon name="function" size={sizeToIconSize(size)} />
);

export const FusionIcon = ({ size }: EntityIconProps) => (
  <Icon name="diagramNodes" size={sizeToIconSize(size)} />
);
