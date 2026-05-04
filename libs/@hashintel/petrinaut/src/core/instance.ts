import type {
  PetrinautDocHandle,
  PetrinautPatch,
  ReadableStore,
} from "./handle";
import {
  startSimulation as createSimulation,
  type Simulation,
  type SimulationConfig,
} from "./simulation";
import {
  createWorkerTransport,
  type WorkerFactory,
} from "./simulation/transport";
import type { SDCPN } from "./types/sdcpn";

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

export type EventStream<T> = {
  subscribe(listener: (event: T) => void): () => void;
};

/**
 * Configuration for {@link Petrinaut.startSimulation}. The document's current
 * SDCPN snapshot is captured at start time; subsequent mutations don't affect
 * the running simulation.
 */
export type StartSimulationConfig = Omit<SimulationConfig, "sdcpn"> & {
  /**
   * Override the worker factory for this run. Defaults to the factory the
   * instance was created with, or the bundled default.
   */
  createWorker?: WorkerFactory;
};

export type Petrinaut = {
  readonly handle: PetrinautDocHandle;

  /** Current SDCPN snapshot store. Falls back to {@link EMPTY_SDCPN} until the handle is ready. */
  readonly definition: ReadableStore<SDCPN>;

  /** Patch event stream. Only fires for handles that produce patches. */
  readonly patches: EventStream<PetrinautPatch[]>;

  /** Apply a mutation to the document via the underlying handle. No-op if read-only. */
  mutate(fn: (draft: SDCPN) => void): void;

  readonly readonly: boolean;

  /** Currently active simulation, if any. */
  readonly simulation: ReadableStore<Simulation | null>;
  /**
   * Spin up a new simulation against the document's current SDCPN snapshot.
   * Disposes any existing simulation first. Resolves once the worker is ready.
   */
  startSimulation(config: StartSimulationConfig): Promise<Simulation>;

  dispose(): void;
};

export type CreatePetrinautConfig = {
  document: PetrinautDocHandle;
  readonly?: boolean;
  simulation?: {
    /**
     * How to construct the simulation web worker. Required if any consumer
     * calls {@link Petrinaut.startSimulation} without an override.
     */
    createWorker?: WorkerFactory;
  };
};

function createDefinitionStore(
  handle: PetrinautDocHandle,
): ReadableStore<SDCPN> {
  const listeners = new Set<(value: SDCPN) => void>();

  const unsubscribe = handle.subscribe((event) => {
    for (const listener of listeners) {
      listener(event.next);
    }
  });

  return {
    get: () => handle.doc() ?? EMPTY_SDCPN,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          // Keep the upstream subscription alive — disposed at instance.dispose().
          void unsubscribe;
        }
      };
    },
  };
}

function createPatchStream(
  handle: PetrinautDocHandle,
): EventStream<PetrinautPatch[]> {
  const listeners = new Set<(event: PetrinautPatch[]) => void>();

  handle.subscribe((event) => {
    if (!event.patches) {
      return;
    }
    for (const listener of listeners) {
      listener(event.patches);
    }
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createSimulationStore(): ReadableStore<Simulation | null> & {
  set(next: Simulation | null): void;
} {
  let current: Simulation | null = null;
  const listeners = new Set<(value: Simulation | null) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}

export function createPetrinaut(config: CreatePetrinautConfig): Petrinaut {
  const { document: handle, readonly = false, simulation: simConfig } = config;

  const disposers: Array<() => void> = [];

  const definition = createDefinitionStore(handle);
  const patches = createPatchStream(handle);
  const simulationStore = createSimulationStore();

  const defaultCreateWorker = simConfig?.createWorker;

  async function start(opts: StartSimulationConfig): Promise<Simulation> {
    const previous = simulationStore.get();
    if (previous) {
      previous.dispose();
      simulationStore.set(null);
    }

    const createWorker = opts.createWorker ?? defaultCreateWorker;
    if (!createWorker) {
      throw new Error(
        "startSimulation: no worker factory available. Pass `simulation.createWorker` to createPetrinaut, or `createWorker` on the start call.",
      );
    }

    const transport = createWorkerTransport(createWorker);

    const sdcpn = handle.doc();
    if (!sdcpn) {
      transport.terminate();
      throw new Error(
        "startSimulation: document handle is not ready (handle.doc() returned undefined).",
      );
    }

    const sim = await createSimulation({
      transport,
      config: {
        sdcpn,
        initialMarking: opts.initialMarking,
        parameterValues: opts.parameterValues,
        seed: opts.seed,
        dt: opts.dt,
        maxTime: opts.maxTime,
        backpressure: opts.backpressure,
        signal: opts.signal,
      },
    });

    simulationStore.set(sim);
    return sim;
  }

  return {
    handle,
    definition,
    patches,
    mutate(fn) {
      if (readonly) {
        return;
      }
      handle.change(fn);
    },
    readonly,
    simulation: simulationStore,
    startSimulation: start,
    dispose() {
      const sim = simulationStore.get();
      if (sim) {
        sim.dispose();
        simulationStore.set(null);
      }
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
  };
}
