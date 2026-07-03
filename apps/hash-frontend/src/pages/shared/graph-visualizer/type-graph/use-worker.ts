/**
 * Creates and disposes a {@link TypeWorkerConnection} on mount/unmount and
 * applies config changes live -- the type-lifecycle mirror of
 * {@link "../render/use-graph-worker"}. No schema registration step: type
 * schemas ride the ingest batches themselves.
 */
import { useEffect, useRef, useState } from "react";

import { defaultVizConfig } from "../config";
import { TypeWorkerConnection } from "../render/type-worker-connection";

import type { VizConfig } from "../config";
import type { TypeWorkerHandle } from "../render/type-worker-connection";

interface UseTypeGraphWorkerOptions {
  /**
   * Must be referentially stable across unrelated renders: a new reference is
   * applied to the live worker as a config change (re-tune + re-layout), not
   * a recreation.
   */
  readonly config?: VizConfig;
  /** Changing this tears down and recreates the worker (clean-slate reset). */
  readonly resetKey?: string | number;
}

interface UseTypeGraphWorkerResult {
  /** Undefined until the connection is created in the mount effect (client only). */
  readonly handle: TypeWorkerHandle | undefined;
  readonly ready: boolean;
  readonly error: string | undefined;
}

export function useTypeGraphWorker({
  config = defaultVizConfig,
  resetKey,
}: UseTypeGraphWorkerOptions): UseTypeGraphWorkerResult {
  const [connection, setConnection] = useState<
    TypeWorkerConnection | undefined
  >(undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // The latest config, read by the mount effect without being one of its
  // dependencies: config changes are applied live below, never by recreation.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const created = new TypeWorkerConnection({
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

  // Live config updates: the connection no-ops when `config` is the reference
  // it already applied, so only real changes reach the worker.
  useEffect(() => {
    if (connection && ready) {
      connection.updateConfig(config);
    }
  }, [connection, ready, config]);

  return { handle: connection, ready, error };
}
