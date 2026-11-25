import { composesOnly } from "@hashintel/petrinaut-core";

import { ActiveNetProvider } from "./document/active-net-provider";
import { CompositionProvider } from "./document/composition-provider";
import { PetrinautInstanceContext } from "./document/instance-context";
import { SDCPNProvider } from "./document/sdcpn-provider";
import { UndoRedoContext } from "./document/undo-redo-context";
import { useHandleHistoryAsUndoRedo } from "./document/use-handle-history-as-undo-redo";
import { ReadOnlyReasonProvider } from "./editing/read-only-reason-provider";
import { EventPlaybackProvider } from "./event-playback/provider";
import { ExecutionFrameProvider } from "./execution-frame/provider";
import { ExecutionTraceProvider } from "./execution-trace/provider";
import { ExperimentHostProvider } from "./experiment-host/provider";
import { ExperimentsProvider } from "./experiments/provider";
import {
  NetManagementContext,
  type NetManagement,
} from "./host/net-management-context";
import { ReadOnlyActionContext } from "./host/read-only-action-context";
import { LanguageClientProvider } from "./lsp/provider";
import { NotificationsProvider } from "./notifications/provider";
import { OptimizationsProvider } from "./optimizations/provider";
import { SimulationProvider } from "./simulation/provider";
import { SimulatorsProvider } from "./simulators/provider";
import { CanvasViewportProvider } from "./state/canvas-viewport-provider";
import { EditorProvider } from "./state/editor-provider";
import { PanelPresenceProvider } from "./state/panel-presence-provider";
import { PanelSizesProvider } from "./state/panel-sizes-provider";
import { UserSettingsProvider } from "./state/user-settings-provider";

import type {
  LspWorkerFactory,
  Petrinaut,
  PlaybackSpeed,
  SimulatorRegistration,
  WorkerFactory,
} from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

export type PetrinautDocumentProviderProps = {
  children: ReactNode;
  instance: Petrinaut;
  netManagement: NetManagement;
};

/**
 * The document bridge shared by the full editor and lightweight Preview.
 * It deliberately contains no workers. User settings live here so every host
 * mounts them once, above a simulation provider that reads the Ad-hoc
 * scenarios setting.
 */
export const PetrinautDocumentProvider: React.FC<
  PetrinautDocumentProviderProps
> = ({ children, instance, netManagement }) => {
  const handleHistoryUndoRedo = useHandleHistoryAsUndoRedo(
    instance.handle.history,
    { sinceTaken: composesOnly(instance.rules) },
  );

  return (
    <PetrinautInstanceContext value={instance}>
      <NetManagementContext value={netManagement}>
        <ReadOnlyActionContext value={netManagement.readOnlyAction}>
          <UndoRedoContext value={handleHistoryUndoRedo ?? null}>
            <UserSettingsProvider>
              <CompositionProvider instance={instance}>
                <SDCPNProvider>{children}</SDCPNProvider>
              </CompositionProvider>
            </UserSettingsProvider>
          </UndoRedoContext>
        </ReadOnlyActionContext>
      </NetManagementContext>
    </PetrinautInstanceContext>
  );
};

export type PetrinautRuntimeProviderProps = {
  children: ReactNode;
  lspWorkerFactory?: LspWorkerFactory;
  eventSimulationWorkerFactory?: WorkerFactory;
  monteCarloWorkerFactory?: WorkerFactory;
  simulators?: readonly SimulatorRegistration[];
};

/**
 * The providers that start a worker or keep a run: the language client, the
 * notices, the simulators, the Quick Simulation, the experiments, the
 * optimizations and the experiment host. Each reads the document and the
 * location above it, and the providers before it in this order. The Preview
 * mounts three of them itself, and only when it plays a run.
 */
export const PetrinautRuntimeProvider: React.FC<
  PetrinautRuntimeProviderProps
> = ({
  children,
  lspWorkerFactory,
  eventSimulationWorkerFactory,
  monteCarloWorkerFactory,
  simulators,
}) => (
  <LanguageClientProvider workerFactory={lspWorkerFactory}>
    <NotificationsProvider>
      <SimulatorsProvider
        runWorkerFactory={eventSimulationWorkerFactory}
        experimentWorkerFactory={monteCarloWorkerFactory}
        registrations={simulators}
      >
        {/* The editor's Quick Simulation runs on a registered simulator. */}
        <SimulationProvider>
          <ExperimentsProvider>
            <OptimizationsProvider>
              <ExperimentHostProvider>{children}</ExperimentHostProvider>
            </OptimizationsProvider>
          </ExperimentsProvider>
        </SimulationProvider>
      </SimulatorsProvider>
    </NotificationsProvider>
  </LanguageClientProvider>
);

export type PetrinautCanvasProviderProps = {
  children: ReactNode;
  initialPlaybackSpeed?: PlaybackSpeed;
};

/**
 * Runtime contexts needed by the existing SDCPN canvas. It consumes the
 * nearest simulation context when one is mounted and otherwise uses the
 * inert default, which keeps the read-only Preview free of simulation workers.
 *
 * The per-net viewport lives here rather than in the document layer: the
 * canvas is its only consumer, and mounting it here gives the Preview the
 * same remembered framing as the editor.
 */
export const PetrinautCanvasProvider: React.FC<
  PetrinautCanvasProviderProps
> = ({ children, initialPlaybackSpeed }) => (
  <CanvasViewportProvider>
    <ActiveNetProvider>
      <PanelSizesProvider>
        <EditorProvider>
          {/* Reads the mode in the commit that changes it, so it sits directly below the editor state. */}
          <ReadOnlyReasonProvider>
            {/* The panels open, close, dock and float by the editor state. This reads it and has Motion animate them. */}
            <PanelPresenceProvider>
              {/* Which execution is viewed follows the editor's mode, and playback plays the one viewed. */}
              <ExecutionTraceProvider>
                <EventPlaybackProvider initialSpeed={initialPlaybackSpeed}>
                  <ExecutionFrameProvider>{children}</ExecutionFrameProvider>
                </EventPlaybackProvider>
              </ExecutionTraceProvider>
            </PanelPresenceProvider>
          </ReadOnlyReasonProvider>
        </EditorProvider>
      </PanelSizesProvider>
    </ActiveNetProvider>
  </CanvasViewportProvider>
);
