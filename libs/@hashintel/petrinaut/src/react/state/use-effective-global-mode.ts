import { use } from "react";

import { EditorContext } from "./editor-context";
import { UserSettingsContext } from "./user-settings-context";

import type { EditorGlobalMode } from "./editor-context";

/**
 * The global mode the editor actually renders. The stored mode can say
 * "notebook" while the experimental notebook flag is off (e.g. the flag was
 * disabled while the view was active); every consumer must agree that this
 * falls back to "edit" — deriving it in one consumer only would render the
 * edit canvas while mutations are still refused with a notebook explanation.
 */
export const useEffectiveGlobalMode = (): EditorGlobalMode => {
  const { globalMode } = use(EditorContext);
  const { enableNotebookView } = use(UserSettingsContext);

  return globalMode === "notebook" && !enableNotebookView ? "edit" : globalMode;
};
