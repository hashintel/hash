import { createContext, use } from "react";

import type { SelectionItem } from "@hashintel/petrinaut-core";

export type CodeEntry = {
  path: string;
  label: string;
  selection: SelectionItem;
  panel: string;
  section: string;
};

export type CodeNavigation = {
  enabled: boolean;
  entries: CodeEntry[];
  open: (path: string, options?: { maximize?: boolean }) => void;
  focusRequest: { path: string } | null;
  acknowledgeFocus: (path: string) => void;
};

export const CodeNavigationContext = createContext<CodeNavigation>({
  enabled: false,
  entries: [],
  open: () => {},
  focusRequest: null,
  acknowledgeFocus: () => {},
});

export const useCodeNavigation = () => use(CodeNavigationContext);
