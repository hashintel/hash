/**
 * Reusing one GPU backend — device, compiled shader, learned calibration —
 * across the batches of an experiment session.
 *
 * A sweep instantiates a batch per ladder rung and re-runs the whole GPU
 * setup each time: request a device, generate and compile the WGSL, probe
 * capacities and windows. All of it re-derives what the previous batch
 * already knew. The cache holds the latest setup keyed by what actually
 * shapes the shader; batches whose key matches lease the cached backend
 * instead of building one.
 *
 * The key deliberately EXCLUDES the values of parameters carried in a
 * per-run buffer (`runParameterIds`): the shader reads those from the
 * buffer, so range batches across different selections still share one
 * backend — and with it the calibration learned on earlier selections.
 * Values of parameters outside the buffer are baked into the shader as
 * literals, so they are in the key.
 *
 * Devices need explicit destruction, and a cached backend can be leased by
 * several batches at once (the ladder pipelines its rungs), so entries
 * count leases: an entry displaced by a new key — or discarded because its
 * setup proved unsupported, its device was lost, or the session ended —
 * destroys its device once the last lease ends.
 */
import type { GpuBackend, GpuBackendUnavailable } from "./backend";

type GpuBackendResult = GpuBackend | GpuBackendUnavailable;

type CacheEntry = {
  key: string;
  promise: Promise<GpuBackendResult>;
  leases: number;
  evicted: boolean;
};

export type GpuBackendCache = {
  /**
   * A backend for `key`: the cached one when the key matches (a build still
   * in flight counts — concurrent rungs share it), otherwise built via
   * `build` and cached. Every successful acquire holds one lease; pair it
   * with exactly one `release`.
   */
  acquire: (
    key: string,
    build: () => Promise<GpuBackendResult>,
  ) => Promise<GpuBackendResult>;
  /**
   * Ends one lease. With `evict`, the entry is also removed so no later
   * batch reuses it (a setup whose probe said unsupported). The device is
   * destroyed once the entry is both evicted and lease-free.
   */
  release: (backend: GpuBackend, options?: { evict?: boolean }) => void;
  /**
   * Removes a leased backend from the cache without ending its leases, for
   * a device the platform lost: later batches build afresh, and the dead
   * device is destroyed once the outstanding leases end.
   */
  invalidate: (backend: GpuBackend) => void;
  /**
   * Evicts whatever is cached, destroying its device once every lease has
   * ended. The last backend of a session is otherwise kept for a next batch
   * that never comes.
   */
  dispose: () => void;
};

export function createGpuBackendCache(): GpuBackendCache {
  let entry: CacheEntry | null = null;
  // Which entry a leased backend belongs to: releases identify entries by
  // the backend object, which stays correct after the entry was displaced.
  const entryByBackend = new WeakMap<GpuBackend, CacheEntry>();

  const destroyWhenIdle = (candidate: CacheEntry) => {
    if (!candidate.evicted || candidate.leases > 0) {
      return;
    }
    void candidate.promise.then((result) => {
      if (result.supported) {
        result.handle.device.destroy();
      }
    });
  };

  /* eslint-disable no-param-reassign -- entries are this cache's own
     mutable bookkeeping records */
  const evict = (candidate: CacheEntry) => {
    if (candidate.evicted) {
      return;
    }
    candidate.evicted = true;
    if (entry === candidate) {
      entry = null;
    }
    destroyWhenIdle(candidate);
  };
  /* eslint-enable no-param-reassign */

  return {
    async acquire(key, build) {
      // Captured before awaiting: a shared build that settles unsupported is
      // evicted by the first waiter, so by the time a later waiter resumes
      // the module-level entry is null or another key's, and the lease it
      // took belongs to the entry it waited on.
      const current = entry;
      if (current !== null && current.key === key) {
        current.leases += 1;
        const cached = await current.promise;
        if (cached.supported) {
          return cached;
        }
        // A failed build slipped in concurrently; drop the lease and fall
        // through to a fresh build below.
        current.leases -= 1;
      }

      const next: CacheEntry = {
        key,
        promise: build(),
        leases: 1,
        evicted: false,
      };
      if (entry !== null) {
        evict(entry);
      }
      entry = next;

      const result = await next.promise;
      if (!result.supported) {
        // Nothing to lease and nothing worth keeping.
        evict(next);
        return result;
      }
      entryByBackend.set(result, next);
      return result;
    },

    release(backend, options) {
      const owner = entryByBackend.get(backend);
      if (!owner) {
        // Not from this cache (or already fully torn down): the caller owns
        // the device.
        backend.handle.device.destroy();
        return;
      }
      owner.leases = Math.max(0, owner.leases - 1);
      if (options?.evict) {
        evict(owner);
      } else {
        destroyWhenIdle(owner);
      }
    },

    invalidate(backend) {
      const owner = entryByBackend.get(backend);
      if (owner) {
        evict(owner);
      }
    },

    dispose() {
      if (entry !== null) {
        evict(entry);
      }
    },
  };
}

/** Identity for objects compared by reference in the setup key. */
let nextObjectId = 1;
const objectIds = new WeakMap<object, number>();
function objectId(value: object | undefined): number {
  if (value === undefined) {
    return 0;
  }
  let id = objectIds.get(value);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(value, id);
  }
  return id;
}

/**
 * What shapes a compiled GPU setup, as a cache key. See the module comment
 * for why per-run-buffered parameter values are excluded.
 */
export function gpuBackendSetupKey(options: {
  sdcpn: object;
  extensions?: object | undefined;
  hirArtifacts?: object | undefined;
  parameterValues: Readonly<Record<string, string>>;
  runParameterIds: readonly string[];
  metricIds: readonly string[];
  dt: number;
  odeMethod: string;
  initialMarking: unknown;
}): string {
  const buffered = new Set(options.runParameterIds);
  const bakedValues = Object.entries(options.parameterValues)
    .filter(([id]) => !buffered.has(id))
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([id, value]) => `${id}=${value}`)
    .join(";");
  return [
    objectId(options.sdcpn),
    objectId(options.extensions),
    objectId(options.hirArtifacts),
    bakedValues,
    [...options.runParameterIds].sort().join(","),
    options.metricIds.join(","),
    options.dt,
    options.odeMethod,
    JSON.stringify(options.initialMarking),
  ].join("|");
}
