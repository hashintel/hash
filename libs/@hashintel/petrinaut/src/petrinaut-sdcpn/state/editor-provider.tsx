import { createContext, useContext, useEffect } from "react";
import { useStore } from "zustand";

import type { EditorState } from "./editor-store";
import { createEditorStore } from "./editor-store";
import { SDCPNContext } from "./sdcpn-provider";

type EditorStore = ReturnType<typeof createEditorStore>;

export const EditorContext = createContext<EditorStore | null>(null);

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  // Get the SDCPN store to pass to the editor store
  const sdcpnStore = useContext(SDCPNContext);

  if (!sdcpnStore) {
    throw new Error("EditorProvider must be used within SDCPNProvider");
  }

  const editorStore = createEditorStore(sdcpnStore);

  useEffect(
    () =>
      sdcpnStore.subscribe((prevState, newState) => {
        if (prevState.sdcpn.id !== newState.sdcpn.id) {
          editorStore.getState().__reinitialize();
          editorStore.getState().setLeftSidebarOpen(true);
        }
      }),
    [sdcpnStore, editorStore],
  );

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
