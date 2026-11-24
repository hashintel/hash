import { type PetrinautNavigationController } from "./navigation/navigation";
import { PetrinautNavigationProvider } from "./navigation/navigation-provider";
import {
  PetrinautCanvasProvider,
  PetrinautDocumentProvider,
  PetrinautRuntimeProvider,
} from "./petrinaut-provider-layers";

import type { NetManagement } from "./host/net-management-context";
import type {
  LspWorkerFactory,
  Petrinaut,
  SimulatorRegistration,
  WorkerFactory,
} from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

export type PetrinautProviderProps = {
  /** The Core instance whose stores the providers subscribe to. */
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
   * components, complete selection, and supported overlays.
   */
  navigation?: PetrinautNavigationController;
  children: ReactNode;
};

/**
 * The one provider a host mounts over a Core instance. It nests the document,
 * the location, the runtime providers and the canvas providers, in that
 * order, and each reads the ones above it. `petrinaut-provider-layers.tsx`
 * lists the providers of each group.
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
      {/* Keyed by handle id so a net switch resets the location and the net-scoped workers below. */}
      <PetrinautNavigationProvider
        controller={navigation}
        key={instance.handle.id}
      >
        <PetrinautRuntimeProvider
          lspWorkerFactory={lspWorkerFactory}
          eventSimulationWorkerFactory={eventSimulationWorkerFactory}
          monteCarloWorkerFactory={monteCarloWorkerFactory}
          simulators={simulators}
        >
          <PetrinautCanvasProvider>{children}</PetrinautCanvasProvider>
        </PetrinautRuntimeProvider>
      </PetrinautNavigationProvider>
    </PetrinautDocumentProvider>
  );
};
