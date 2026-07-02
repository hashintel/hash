/**
 * Creates and disposes a {@link WorkerConnection} on mount/unmount, forwards
 * schema registration when the worker is ready, and applies config changes
 * live (the worker re-tunes and re-lays out; it is not recreated).
 */
import { useEffect, useRef, useState } from "react";

import { defaultVizConfig } from "../config";
import { WorkerConnection } from "./worker-connection";

import type { VizConfig } from "../config";
import type { PropertySchemaEntry, TypeSchemaEntry } from "../worker/protocol";
import type { WorkerHandle } from "./worker-connection";

interface UseGraphWorkerOptions {
  /**
   * Must be referentially stable across unrelated renders (module constant
   * or memoized): a new reference is treated as a config change and applied
   * to the live worker, forcing a re-layout. Changing it does NOT recreate
   * the worker; ingested entities survive.
   */
  readonly config?: VizConfig;
  readonly typeSchemas: readonly TypeSchemaEntry[];
  readonly propertySchemas: readonly PropertySchemaEntry[];
  /** Changing this tears down and recreates the worker (clean-slate reset). */
  readonly resetKey?: string | number;
}

interface UseGraphWorkerResult {
  /** Undefined until the connection is created in the mount effect (client only). */
  readonly handle: WorkerHandle | undefined;
  readonly ready: boolean;
  readonly error: string | undefined;
}

export function useGraphWorker({
  config = defaultVizConfig,
  typeSchemas,
  propertySchemas,
  resetKey,
}: UseGraphWorkerOptions): UseGraphWorkerResult {
  const [connection, setConnection] = useState<WorkerConnection | undefined>(
    undefined,
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // The latest config, read by the mount effect without being one of its
  // dependencies: config changes are applied live below, never by recreation.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const created = new WorkerConnection({
      config: configRef.current,
      onReady: () => setReady(true),
      onError: setError,
    });
    setConnection(created);
    return () => {
      created.dispose();
      setConnection(undefined);
      setReady(false);
      setError(undefined);
    };
  }, [resetKey]);

  // Live config updates: the connection no-ops when `config` is the
  // reference it already applied (e.g. this effect re-firing on the ready
  // flip), so only real changes reach the worker.
  useEffect(() => {
    if (connection && ready) {
      connection.updateConfig(config);
    }
  }, [connection, ready, config]);

  useEffect(() => {
    if (connection && ready && typeSchemas.length > 0) {
      connection.registerTypes(typeSchemas, propertySchemas);
    }
  }, [connection, ready, typeSchemas, propertySchemas]);

  return { handle: connection, ready, error };
}
