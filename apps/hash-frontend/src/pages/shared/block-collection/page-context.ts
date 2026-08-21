import { createContext, useContext } from "react";

import type { EntityId } from "@blockprotocol/type-system";
import type { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import type { EditorView } from "prosemirror-view";
import type { RefObject } from "react";

export interface EditorContext {
  view: EditorView;
  manager: ProsemirrorManager;
}

interface PageContextProps {
  pageEntityId: EntityId;
  editorContext: EditorContext | undefined;
  setEditorContext: (context: EditorContext) => void;
  pageTitleRef: RefObject<HTMLTextAreaElement | null>;
}

export const PageContext = createContext<PageContextProps | null>(null);

export const usePageContext = () => {
  const context = useContext(PageContext);

  if (!context) {
    throw new Error("no PageContext value has been provided");
  }

  return context;
};

export const usePageContextOptional = () => {
  const context = useContext(PageContext);

  return context;
};
