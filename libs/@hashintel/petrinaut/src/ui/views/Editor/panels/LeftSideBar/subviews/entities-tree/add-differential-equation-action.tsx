import { use } from "react";

import { Button } from "@hashintel/ds-components";
import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generatePetrinautId,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { useEditorActions } from "../../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";

/**
 * Adds a differential equation from the tree's Differential Equations group
 * header.
 */
export const AddDifferentialEquationAction: React.FC = () => {
  const {
    activeNet: { types, differentialEquations },
  } = use(ActiveNetContext);
  const { addDifferentialEquation } = usePetrinautMutations();
  const { selectItem } = useEditorActions();

  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Add differential equation"
      size="xs"
      variant="ghost"
      disabled={isReadOnly}
      tooltip={
        isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add differential equation"
      }
      iconName="plus"
      onClick={() => {
        const name = `Equation ${differentialEquations.length + 1}`;
        const id = generatePetrinautId();
        addDifferentialEquation({
          id,
          name,
          colorId: types.length > 0 ? types[0]!.id : null,
          code: DEFAULT_DIFFERENTIAL_EQUATION_CODE,
          arity: 1,
        });
        selectItem({ type: "differentialEquation", id });
      }}
    />
  );
};
