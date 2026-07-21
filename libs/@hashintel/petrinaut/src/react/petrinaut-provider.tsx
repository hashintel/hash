import { type ReactNode } from "react";

import {
  type Petrinaut,
  type LspWorkerFactory,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameProvider } from "./execution-frame/provider";
import { ExperimentsProvider } from "./experiments/provider";
import { PetrinautInstanceContext } from "./instance-context";
import { LanguageClientProvider } from "./lsp/provider";
import {
  NetManagementContext,
  type NetManagement,
} from "./net-management-context";
import { NotificationsProvider } from "./notifications/provider";
import { OptimizationsProvider } from "./optimizations/provider";
import { PlaybackProvider } from "./playback/provider";
import { SDCPNProvider } from "./sdcpn-provider";
import { SimulationProvider } from "./simulation/provider";
import { ActiveNetProvider } from "./state/active-net-provider";
import { EditorProvider } from "./state/editor-provider";
import { UndoRedoContext } from "./state/undo-redo-context";
import { UserSettingsProvider } from "./state/user-settings-provider";
import { useHandleHistoryAsUndoRedo } from "./use-handle-history-as-undo-redo";

export type PetrinautProviderProps = {
  /** The Core instance whose stores the bridges subscribe to. */
  instance: Petrinaut;
  /** Host-owned net-management actions and metadata (title, switching, …). */
  netManagement: NetManagement;
  /**
   * Optional simulation worker factory. When provided, the SimulationProvider
   * uses it instead of the bundled inlined-blob default. Hosts that consume
   * the published dist (rather than building from source) should pass their
   * own factory — e.g. via Vite's `?worker` directive — to avoid load-time
   * issues with the inlined worker.
   */
  simulationWorkerFactory?: WorkerFactory;
  monteCarloWorkerFactory?: WorkerFactory;
  /**
   * Optional language-server worker factory. Same shape as
   * `simulationWorkerFactory` — provided when the host needs to bundle the
   * LSP worker themselves rather than relying on the inlined-blob default.
   */
  lspWorkerFactory?: LspWorkerFactory;
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
  simulationWorkerFactory,
  monteCarloWorkerFactory,
  lspWorkerFactory,
  children,
}) => {
  const handleHistoryUndoRedo = useHandleHistoryAsUndoRedo(
    instance.handle.history,
  );

  // Keyed by handle id so a net switch fully resets net-scoped worker state.
  const inner = (
    <SDCPNProvider>
      <LanguageClientProvider
        key={instance.handle.id}
        workerFactory={lspWorkerFactory}
      >
        <NotificationsProvider>
          <SimulationProvider
            key={instance.handle.id}
            workerFactory={simulationWorkerFactory}
          >
            <ExperimentsProvider workerFactory={monteCarloWorkerFactory}>
              <OptimizationsProvider>
                <PlaybackProvider>
                  <UserSettingsProvider>
                    <ActiveNetProvider>
                      <EditorProvider>
                        <ExecutionFrameProvider>
                          {children}
                        </ExecutionFrameProvider>
                      </EditorProvider>
                    </ActiveNetProvider>
                  </UserSettingsProvider>
                </PlaybackProvider>
              </OptimizationsProvider>
            </ExperimentsProvider>
          </SimulationProvider>
        </NotificationsProvider>
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
