import { createContext } from "react";

import type { RevisionSummary } from "../petrinaut-editor";

/**
 * What the top-bar items read: the editor owns this state and provides it
 * above Petrinaut, so the plugin itself stays a stable module constant.
 */
export type TopBarState = {
  title: string;
  onTitleChange: (title: string) => void;
  readonly: boolean;
  isDirty: boolean;
  persistPending: boolean;
  saveLabel: string;
  revisions: RevisionSummary[];
  loadedRevisionTime: string | null;
  onNavigateBack: () => void;
  onSave: () => void;
  onLoadRevision: (revision: RevisionSummary) => void;
};

export const TopBarContext = createContext<TopBarState | null>(null);
