import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { EditorState } from "./editor-store";
import { createEditorStore } from "./editor-store";

type EditorStore = ReturnType<typeof createEditorStore>;

export const EditorContext = createContext<EditorStore | null>(null);

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const editorStore = createEditorStore();

  return (
    <EditorContext.Provider value={editorStore}>
      {children}
    </EditorContext.Provider>
  );
};

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorContext);

  if (!store) {
    throw new Error("useEditorStore must be used within EditorProvider");
  }

  return useStore(store, selector);
}
