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

import type { NetManagement } from "./net-management-context";
import type {
  Petrinaut,
  LspWorkerFactory,
  WorkerFactory,
} from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

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
  simulationWorkerFactory,
  monteCarloWorkerFactory,
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
            {/* The simulation provider reads the Ad-hoc scenarios user
                setting, which the document layer above provides. */}
            <SimulationProvider
              key={instance.handle.id}
              workerFactory={simulationWorkerFactory}
            >
              <ExperimentsProvider workerFactory={monteCarloWorkerFactory}>
                <OptimizationsProvider>
                  <PetrinautCanvasProvider>{children}</PetrinautCanvasProvider>
                </OptimizationsProvider>
              </ExperimentsProvider>
            </SimulationProvider>
          </NotificationsProvider>
        </LanguageClientProvider>
      </PetrinautNavigationProvider>
    </PetrinautDocumentProvider>
  );
};
