import { createContext } from "react";

import type { RevisionSummary } from "../../shared/messages";

/**
 * What the embed's top-bar items read: the page owns this state and provides
 * it above the editor, so the plugin itself stays a stable module constant.
 */
export type EmbedChrome = {
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

export const EmbedChromeContext = createContext<EmbedChrome | null>(null);
