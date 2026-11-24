import { DifferentialEquationIcon } from "../../../../../shared/entity-icons";
import { DiffEqCodeAction, DiffEqMainContent } from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const diffEqMainSubView: SubView = {
  id: "diff-eq-main-content",
  fullWidthCodeEditor: true,
  title: "Differential Equation",
  icon: DifferentialEquationIcon,
  main: true,
  component: DiffEqMainContent,
  headerAction: DiffEqCodeAction,
  headerActionMutates: true,
};
