import { createContext, useContext } from "react";

import type { DocSectionId } from "./docs-types";

export interface DocsCtx {
  /** Open the docs modal at a section, optionally scrolled to an entry/anchor. */
  openDocs: (section: DocSectionId, sub?: string) => void;
}

export const DocsContext = createContext<DocsCtx>({ openDocs: () => {} });

export function useDocs() {
  return useContext(DocsContext);
}
