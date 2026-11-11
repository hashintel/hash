import { ExperimentHostProvider } from "./experiment-host/provider";
import { ExperimentsProvider } from "./experiments/provider";
import { LanguageClientProvider } from "./lsp/provider";
import {
  PetrinautNavigationProvider,
  type PetrinautNavigationController,
} from "./navigation";
import { NotificationsProvider } from "./notifications/provider";
import { OptimizationsProvider } from "./optimizations/provider";
import {
  PetrinautCanvasProvider,
  PetrinautDocumentProvider,
} from "./petrinaut-provider-layers";
import { SimulationProvider } from "./simulation/provider";
import { SimulatorsProvider } from "./simulators/provider";

import type { NetManagement } from "./net-management-context";
import type {
  LspWorkerFactory,
  Petrinaut,
  SimulatorRegistration,
  WorkerFactory,
} from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

export type PetrinautProviderProps = {
  /** The Core instance whose stores the bridges subscribe to. */
  instance: Petrinaut;
  /** Host-owned net-management actions and metadata (title, switching, …). */
  netManagement: NetManagement;
  /**
   * Optional factory for the worker a Quick Simulation's run is stepped in.
   * When provided, the built-in simulators use it instead of the bundled
   * inlined-blob default. Hosts that consume the published dist (rather
   * than building from source) should pass their own factory — e.g. via
   * Vite's `?worker` directive — to avoid load-time issues with the inlined
   * worker.
   */
  eventSimulationWorkerFactory?: WorkerFactory;
  /**
   * Optional factory for a worker of the pool an experiment's runs are split
   * across, with the same role and default as `eventSimulationWorkerFactory`.
   */
  monteCarloWorkerFactory?: WorkerFactory;
  /**
   * Simulators the host adds to the built-in ones. They are listed after
   * them wherever a simulator is picked.
   */
  simulators?: readonly SimulatorRegistration[];
  /**
   * Optional language-server worker factory. Same shape as
   * `eventSimulationWorkerFactory` — provided when the host needs to bundle the
   * LSP worker themselves rather than relying on the inlined-blob default.
   */
  lspWorkerFactory?: LspWorkerFactory;
  /**
   * Optional host-owned app location. This keeps Petrinaut router-neutral
   * while allowing URLs and Back / Forward to control workspaces, resources,
   * subnets, complete selection, and supported overlays.
   */
  navigation?: PetrinautNavigationController;
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
  eventSimulationWorkerFactory,
  monteCarloWorkerFactory,
  simulators,
  lspWorkerFactory,
  navigation,
  children,
}) => {
  return (
    <PetrinautDocumentProvider
      instance={instance}
      netManagement={netManagement}
    >
      <PetrinautNavigationProvider
        controller={navigation}
        key={instance.handle.id}
      >
        {/* Keyed by handle id so a net switch resets net-scoped workers. */}
        <LanguageClientProvider
          key={instance.handle.id}
          workerFactory={lspWorkerFactory}
        >
          <NotificationsProvider>
            <SimulatorsProvider
              runWorkerFactory={eventSimulationWorkerFactory}
              experimentWorkerFactory={monteCarloWorkerFactory}
              registrations={simulators}
            >
              {/* The editor's Quick Simulation runs on a registered simulator. */}
              <SimulationProvider key={instance.handle.id}>
                <ExperimentsProvider workerFactory={monteCarloWorkerFactory}>
                  <OptimizationsProvider>
                    <ExperimentHostProvider>
                      <PetrinautCanvasProvider>
                        {children}
                      </PetrinautCanvasProvider>
                    </ExperimentHostProvider>
                  </OptimizationsProvider>
                </ExperimentsProvider>
              </SimulationProvider>
            </SimulatorsProvider>
          </NotificationsProvider>
        </LanguageClientProvider>
      </PetrinautNavigationProvider>
    </PetrinautDocumentProvider>
  );
};
