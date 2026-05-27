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
   * Optional simulation worker factory. Legacy escape hatch — used only
   * when {@link evalSandbox} is **not** supplied. Hosts that consume
   * the published dist (rather than building from source) can pass their
   * own factory — e.g. via Vite's `?worker` directive — to avoid load-time
   * issues with the inlined worker.
   *
   * Ignored when {@link evalSandbox} is provided (the sandbox owns its
   * own workers so they inherit the sandbox's opaque origin).
   */
  simulationWorkerFactory?: WorkerFactory;
  /**
   * Optional Monte Carlo worker factory. Legacy escape hatch — same
   * semantics as {@link simulationWorkerFactory}; ignored when
   * {@link evalSandbox} is provided.
   */
  monteCarloWorkerFactory?: WorkerFactory;
  /**
   * Optional language-server worker factory. Same shape as
   * `simulationWorkerFactory` — provided when the host needs to bundle the
   * LSP worker themselves rather than relying on the inlined-blob default.
   *
   * Unlike the simulation/Monte-Carlo factories, the LSP worker is not
   * owned by the sandbox (the LSP runs in the host realm against the
   * host's own type definitions), so this prop is always honoured.
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
   * When provided, {@link simulationWorkerFactory} and
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

  // Per the docs on `simulationWorkerFactory` / `monteCarloWorkerFactory`,
  // those props are honoured only when no host `evalSandbox` is supplied
  // (the legacy bring-your-own-worker path). When a sandbox is provided,
  // it owns worker creation — its workers run inside the sandbox so they
  // inherit the opaque origin and the sandbox's CSP.
  const effectiveSimulationWorkerFactory = hostProvidedSandbox
    ? undefined
    : simulationWorkerFactory;
  const effectiveMonteCarloWorkerFactory = hostProvidedSandbox
    ? undefined
    : monteCarloWorkerFactory;

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
            workerFactory={effectiveSimulationWorkerFactory}
          >
            <ExperimentsProvider
              workerFactory={effectiveMonteCarloWorkerFactory}
            >
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
