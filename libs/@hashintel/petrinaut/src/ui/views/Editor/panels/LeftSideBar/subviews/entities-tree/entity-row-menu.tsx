import { Button, Menu } from "@hashintel/ds-components";

import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { useEditorState } from "../../../../../../../react/state/editor-context";
import { useCodeNavigation } from "../../../../../../monaco/code-navigation-context";

import type { EntityItem } from "./entity-groups";

/** The ellipsis menu of an entity's row: its code sections and Delete. Draws nothing where it has no entry. */
export const EntityRowMenu: React.FC<Pick<EntityItem, "id" | "type">> = ({
  id,
  type,
}) => {
  const { removeType, removeDifferentialEquation, removeParameter } =
    usePetrinautMutations();
  const globalMode = useEditorState((editor) => editor.globalMode);
  const isReadOnly = useIsReadOnly();
  const { enabled, entries, open } = useCodeNavigation();

  // Parameters hide their menu in simulation mode
  if (type === "parameter" && globalMode === "simulate") {
    return null;
  }

  const codeItems = enabled
    ? entries
        .filter((entry) => entry.selection.id === id)
        .map((entry) => ({
          id: entry.path,
          text: `Open ${entry.label.toLowerCase()}`,
          onClick: () => open(entry.path),
        }))
    : [];
  const deleteActions: Partial<Record<EntityItem["type"], () => void>> = {
    type: () => removeType({ typeId: id }),
    differentialEquation: () => removeDifferentialEquation({ equationId: id }),
    parameter: () => removeParameter({ parameterId: id }),
  };
  const deleteAction = deleteActions[type];

  if (!deleteAction && codeItems.length === 0) {
    return null;
  }

  return (
    <Menu
      trigger={
        <Button
          aria-label="More options"
          tooltip="More options"
          size="xxs"
          variant="ghost"
          iconName="ellipsis"
          onClick={(event) => event.stopPropagation()}
        />
      }
      items={[
        ...codeItems,
        ...(deleteAction
          ? [
              {
                id: "delete",
                text: "Delete",
                icon: "trash" as const,
                tone: "error" as const,
                disabled: isReadOnly,
                onClick: deleteAction,
              },
            ]
          : []),
      ]}
      position="right"
    />
  );
};
