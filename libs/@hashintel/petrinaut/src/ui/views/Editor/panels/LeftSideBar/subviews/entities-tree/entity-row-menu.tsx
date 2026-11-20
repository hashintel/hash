import { Button, Menu } from "@hashintel/ds-components";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { useEditorState } from "../../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { useCodeNavigation } from "../../../../../../monaco/code-navigation";

import type { EntityItem } from "./use-entity-tree-items";

/** The ellipsis menu of an entity's row: its code sections and Delete. Draws nothing where it has no entry. */
export const EntityRowMenu: React.FC<{ item: EntityItem }> = ({
  item: { id, type },
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
