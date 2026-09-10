import { use } from "react";
import { v4 as uuidv4 } from "uuid";

import { Button } from "@hashintel/ds-components";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";

/** Adds a global parameter from the tree's Parameters group header. */
export const AddParameterAction: React.FC = () => {
  const {
    activeNet: { parameters },
  } = use(ActiveNetContext);
  const { extensions } = use(SDCPNContext);
  const { addParameter } = usePetrinautMutations();
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();
  const isDisabled = isReadOnly || !extensions.parameters;
  let tooltip = "Add parameter";
  if (isReadOnly) {
    tooltip = UI_MESSAGES.READ_ONLY_MODE;
  } else if (!extensions.parameters) {
    tooltip = UI_MESSAGES.EXTENSION_UNAVAILABLE;
  }

  const handleAddParameter = () => {
    if (!extensions.parameters) {
      return;
    }
    const name = `param${parameters.length + 1}`;
    const id = uuidv4();
    addParameter({
      id,
      name: `Parameter ${parameters.length + 1}`,
      variableName: name,
      type: "real",
      defaultValue: "0",
    });
    selectItem({ type: "parameter", id });
  };

  return (
    <Button
      aria-label="Add parameter"
      size="xs"
      variant="ghost"
      disabled={isDisabled}
      tooltip={tooltip}
      iconName="plus"
      onClick={handleAddParameter}
    />
  );
};
