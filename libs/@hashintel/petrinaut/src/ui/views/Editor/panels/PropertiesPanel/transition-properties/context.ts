import { requiredContext } from "../../../../../../react/required-context";

import type {
  Color,
  Transition,
  TransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

export const [TransitionPropertiesContext, useTransitionPropertiesContext] =
  requiredContext<{
    transition: Transition;
    types: Color[];
    logicAvailability: TransitionLogicAvailability;
  }>("TransitionProperties");
