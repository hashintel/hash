import { addableActions } from "../shared/step-display";

import type { MenuItem } from "@hashintel/ds-components";

/** The "+" list's items: one per action that can be added, until the Add picker replaces it. */
export const getAddStepMenuItems = (
  onPick: (actionDefinitionId: string) => void,
): MenuItem[] =>
  addableActions.map(({ actionDefinitionId, label, icon }) => ({
    id: actionDefinitionId,
    text: label,
    icon,
    onClick: () => onPick(actionDefinitionId),
  }));
