/** React lifecycle wrapper around {@link WorkerConnection}. */
import { useEffect, useState } from "react";

import { defaultVizConfig } from "../config";
import { WorkerConnection } from "./worker-connection";

import type { VizConfig } from "../config";
import type { PropertySchemaEntry, TypeSchemaEntry } from "../worker/protocol";
import type { WorkerHandle } from "./worker-connection";

interface UseGraphWorkerOptions {
  /**
   * Must be referentially stable (module constant or memoized): it is an
   * effect dependency below, so a config object rebuilt each render would
   * tear down and recreate the worker every render.
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

  useEffect(() => {
    const created = new WorkerConnection({
      config,
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
  }, [config, resetKey]);

  // Send type + property schemas once the worker is ready and whenever they change.
  useEffect(() => {
    if (connection && ready && typeSchemas.length > 0) {
      connection.registerTypes(typeSchemas, propertySchemas);
    }
  }, [connection, ready, typeSchemas, propertySchemas]);

  return { handle: connection, ready, error };
}
