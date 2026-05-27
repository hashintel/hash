import { type ReactNode, use, useEffect, useMemo } from "react";

import {
  type Petrinaut,
  type LspWorkerFactory,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";

import { ErrorTrackerContext } from "./error-tracker-context";
import { EvalSandboxContext } from "./eval-sandbox/context";
import { createInlineSandbox } from "./eval-sandbox/inline";
import { ExperimentsProvider } from "./experiments/provider";
import { PetrinautInstanceContext } from "./instance-context";
import { LanguageClientProvider } from "./lsp/provider";
import {
  NetManagementContext,
  type NetManagement,
} from "./net-management-context";
import { NotificationsProvider } from "./notifications/provider";
import { PlaybackProvider } from "./playback/provider";
import { SDCPNProvider } from "./sdcpn-provider";
import { SimulationProvider } from "./simulation/provider";
import { EditorProvider } from "./state/editor-provider";
import { UndoRedoContext } from "./state/undo-redo-context";
import { UserSettingsProvider } from "./state/user-settings-provider";
import { useHandleHistoryAsUndoRedo } from "./use-handle-history-as-undo-redo";

import type { EvalSandbox } from "./eval-sandbox/interface";

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
  /**
   * Optional {@link EvalSandbox} that owns all user-code evaluation
   * (scenarios, metrics, simulation/Monte-Carlo workers, visualizers).
   * Defaults to {@link createInlineSandbox} (in-realm eval, same as
   * pre-sandbox behavior). Pass `createIframeSandbox({ src })` from
   * `@hashintel/petrinaut/sandbox-iframe` to isolate user code in a
   * sandboxed iframe — see the package README for host setup.
   *
   * When provided, {@link simulationWorkerFactory},
   * {@link monteCarloWorkerFactory} are ignored (the sandbox owns its
   * own workers).
   */
  evalSandbox?: EvalSandbox;
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
  evalSandbox: hostProvidedSandbox,
  children,
}) => {
  const handleHistoryUndoRedo = useHandleHistoryAsUndoRedo(
    instance.handle.history,
  );

  // Surface visualizer/JIT compile errors from the inline fallback
  // sandbox through whichever error tracker the host has wired up
  // (in hash-frontend that's Sentry — see
  // `apps/hash-frontend/src/pages/process.page/process-editor-wrapper.tsx`).
  const errorTracker = use(ErrorTrackerContext);

  // When the host doesn't supply one, fall back to the inline sandbox
  // (in-realm eval — same behavior as pre-sandbox Petrinaut).
  const fallbackSandbox = useMemo<EvalSandbox | null>(
    () =>
      hostProvidedSandbox
        ? null
        : createInlineSandbox({
            onError: (error) => errorTracker.captureException(error),
          }),
    [hostProvidedSandbox, errorTracker],
  );
  const evalSandbox = hostProvidedSandbox ?? fallbackSandbox!;

  // Dispose the fallback when this provider unmounts. Host-provided
  // sandboxes have their own owner — we don't touch those.
  useEffect(() => {
    if (!fallbackSandbox) {
      return;
    }
    return () => fallbackSandbox.dispose();
  }, [fallbackSandbox]);

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
              <PlaybackProvider>
                <UserSettingsProvider>
                  <EditorProvider>{children}</EditorProvider>
                </UserSettingsProvider>
              </PlaybackProvider>
            </ExperimentsProvider>
          </SimulationProvider>
        </NotificationsProvider>
      </LanguageClientProvider>
    </SDCPNProvider>
  );

  return (
    <EvalSandboxContext value={evalSandbox}>
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
    </EvalSandboxContext>
  );
};
