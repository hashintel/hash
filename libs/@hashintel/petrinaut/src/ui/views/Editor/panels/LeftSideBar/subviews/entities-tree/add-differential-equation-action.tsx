import { use } from "react";
import { v4 as uuidv4 } from "uuid";

import { Button } from "@hashintel/ds-components";
import { DEFAULT_DIFFERENTIAL_EQUATION_CODE } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
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
  const { extensions } = use(SDCPNContext);
  const { addDifferentialEquation } = usePetrinautMutations();
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();
  const isDisabled = isReadOnly || !extensions.colors || !extensions.dynamics;
  let tooltip = "Add differential equation";
  if (isReadOnly) {
    tooltip = UI_MESSAGES.READ_ONLY_MODE;
  } else if (!extensions.colors || !extensions.dynamics) {
    tooltip = UI_MESSAGES.EXTENSION_UNAVAILABLE;
  }

  return (
    <Button
      aria-label="Add differential equation"
      size="xs"
      variant="ghost"
      disabled={isDisabled}
      tooltip={tooltip}
      iconName="plus"
      onClick={() => {
        const name = `Equation ${differentialEquations.length + 1}`;
        const id = uuidv4();
        addDifferentialEquation({
          id,
          name,
          colorId: types.length > 0 ? types[0]!.id : null,
          code: DEFAULT_DIFFERENTIAL_EQUATION_CODE,
        });
        selectItem({ type: "differentialEquation", id });
      }}
    />
  );
};
