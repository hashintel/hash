import { use } from "react";

import { EditorContext } from "./editor-context";
import { SDCPNContext } from "./sdcpn-context";
import { UserSettingsContext } from "./user-settings-context";

import type { EditViewMode } from "./editor-context";

/**
 * The Kanban board projects a status view, so the view is offered only while
 * the Status views setting is on and the net declares at least one view.
 */
export const useKanbanViewAvailable = (): boolean => {
  const { enableStatusViews } = use(UserSettingsContext);
  const { petriNetDefinition } = use(SDCPNContext);

  return enableStatusViews && (petriNetDefinition.statusViews ?? []).length > 0;
};

/**
 * The view the workspace actually renders. The stored view can say "kanban"
 * after the setting was turned off or the last status view was deleted, and
 * "definitions" outside Edit mode; both fall back to the canvas. Every
 * consumer derives the view here so the rendered surface and the command
 * rules never disagree.
 */
export const useEffectiveEditViewMode = (): EditViewMode => {
  const { globalMode, editViewMode } = use(EditorContext);
  const kanbanAvailable = useKanbanViewAvailable();

  if (editViewMode === "kanban" && !kanbanAvailable) {
    return "canvas";
  }
  if (editViewMode === "definitions" && globalMode !== "edit") {
    return "canvas";
  }
  return editViewMode;
};
