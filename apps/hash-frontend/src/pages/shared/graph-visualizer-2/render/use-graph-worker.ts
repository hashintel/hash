/**
 * Thin React lifecycle wrapper around {@link WorkerConnection}: creates the
 * connection on mount, surfaces the only two pieces of state the tree re-renders on
 * (`ready` for the ingest gate, `error`), and feeds it new type schemas. All per-frame
 * data flows through the connection's subscribe stream, never React state.
 */
import { useEffect, useState } from "react";

import { defaultVizConfig } from "../config";
import { WorkerConnection } from "./worker-connection";

import type { VizConfig } from "../config";
import type { PropertySchemaEntry, TypeSchemaEntry } from "../worker/protocol";
import type { WorkerHandle } from "./worker-connection";

interface UseGraphWorkerOptions {
  readonly config?: VizConfig;
  readonly typeSchemas: readonly TypeSchemaEntry[];
  readonly propertySchemas: readonly PropertySchemaEntry[];
  /**
   * Tears down and recreates the worker whenever this value changes. The worker's ingest is
   * additive, so it has no way to retract entities; the caller changes this when the entity set is
   * REPLACED (its data source changed), not merely extended, to start from a clean slate.
   */
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
