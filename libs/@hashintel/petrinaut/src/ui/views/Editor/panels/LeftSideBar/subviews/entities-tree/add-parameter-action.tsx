import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { generatePetrinautId } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";

/** Adds a global parameter from the tree's Parameters group header. */
export const AddParameterAction: React.FC = () => {
  const {
    activeNet: { parameters },
  } = use(ActiveNetContext);
  const { addParameter } = usePetrinautMutations();
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Add parameter"
      size="xs"
      variant="ghost"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add parameter"}
      iconName="plus"
      onClick={() => {
        const id = generatePetrinautId();
        addParameter({
          id,
          name: `Parameter ${parameters.length + 1}`,
          variableName: `param${parameters.length + 1}`,
          type: "real",
          defaultValue: "0",
        });
        selectItem({ type: "parameter", id });
      }}
    />
  );
};
