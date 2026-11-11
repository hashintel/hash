import { createContext } from "react";

import type { RevisionSummary } from "../petrinaut-editor";
import type { SaveRefusal } from "./save-availability";

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
  /** Why Save can't start now, or `null` when it can. */
  saveRefusal: SaveRefusal | null;
  saveLabel: string;
  revisions: RevisionSummary[];
  loadedRevisionTime: string | null;
  onNavigateBack: () => void;
  onSave: () => void;
  onLoadRevision: (revision: RevisionSummary) => void;
};

export const TopBarContext = createContext<TopBarState | null>(null);
