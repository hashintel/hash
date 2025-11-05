import { createContext, useContext, useRef } from "react";
import { useStore } from "zustand";

import type { EditorState } from "./editor-store";
import { createEditorStore } from "./editor-store";
import { SDCPNContext } from "./sdcpn-provider";

type EditorStore = ReturnType<typeof createEditorStore>;

const EditorContext = createContext<EditorStore | null>(null);

export type EditorProviderProps = React.PropsWithChildren;

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const storeRef = useRef<EditorStore | undefined>(undefined);

  // Get the SDCPN store to pass to the editor store
  const sdcpnStore = useContext(SDCPNContext);

  if (!sdcpnStore) {
    throw new Error("EditorProvider must be used within SDCPNProvider");
  }

  if (!storeRef.current) {
    // Verify sdcpnStore has getState before creating the editor store
    if (typeof sdcpnStore.getState !== "function") {
      throw new Error("SDCPN store does not have a getState method");
    }
    storeRef.current = createEditorStore(sdcpnStore);
  }

  return (
    <EditorContext.Provider value={storeRef.current}>
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
