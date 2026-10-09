import { createContext } from "react";

import type { RevisionSummary } from "../../shared/messages";

/** The page state the embed's top-bar items read. */
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
