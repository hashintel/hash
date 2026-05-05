import { type ReactNode } from "react";

import type { Petrinaut } from "../core/instance";
import { EditorProvider } from "./state/editor-provider";
import { UndoRedoContext } from "./state/undo-redo-context";
import { UserSettingsProvider } from "./state/user-settings-provider";
import { PetrinautInstanceContext } from "./instance-context";
import { LanguageClientProvider } from "./lsp/provider";
import { MutationProvider } from "./mutation-provider";
import {
  NetManagementContext,
  type NetManagement,
} from "./net-management-context";
import { PlaybackProvider } from "./playback/provider";
import { SDCPNProvider } from "./sdcpn-provider";
import { SimulationProvider } from "./simulation/provider";
import { useHandleHistoryAsUndoRedo } from "./use-handle-history-as-undo-redo";

export type PetrinautProviderProps = {
  /** The Core instance whose stores the bridges subscribe to. */
  instance: Petrinaut;
  /** Host-owned net-management actions and metadata (title, switching, …). */
  netManagement: NetManagement;
  children: ReactNode;
};

/**
 * Single React entry that mounts every bridge provider over a Core instance.
 * Each child provider reads from `instance` (or, for net-management info, from
 * {@link NetManagementContext}) and republishes through its existing legacy
 * context — so `/ui` consumers don't change.
 */
export const PetrinautProvider: React.FC<PetrinautProviderProps> = ({
  instance,
  netManagement,
  children,
}) => {
  const handleHistoryUndoRedo = useHandleHistoryAsUndoRedo(
    instance.handle.history,
  );

  // Keyed by handle id so a net switch fully resets the LSP worker
  // and its in-flight diagnostics.
  const inner = (
    <SDCPNProvider>
      <LanguageClientProvider key={instance.handle.id}>
        <SimulationProvider>
          <PlaybackProvider>
            <UserSettingsProvider>
              <EditorProvider>
                <MutationProvider>{children}</MutationProvider>
              </EditorProvider>
            </UserSettingsProvider>
          </PlaybackProvider>
        </SimulationProvider>
      </LanguageClientProvider>
    </SDCPNProvider>
  );

  return (
    <PetrinautInstanceContext value={instance}>
      <NetManagementContext value={netManagement}>
        {handleHistoryUndoRedo ? (
          // Only override UndoRedoContext when the handle actually provides
          // history — otherwise leave any outer UndoRedoContext (e.g. one
          // injected by the legacy `<Petrinaut>` adapter) untouched.
          <UndoRedoContext value={handleHistoryUndoRedo}>
            {inner}
          </UndoRedoContext>
        ) : (
          inner
        )}
      </NetManagementContext>
    </PetrinautInstanceContext>
  );
};
