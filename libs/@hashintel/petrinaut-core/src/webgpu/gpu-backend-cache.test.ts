import { describe, expect, it } from "vitest";

import { createGpuBackendCache, gpuBackendSetupKey } from "./gpu-backend-cache";

import type { GpuBackend, GpuBackendUnavailable } from "./backend";

function fakeBackend() {
  let destroyed = 0;
  const backend = {
    supported: true,
    handle: {
      device: {
        destroy: () => {
          destroyed += 1;
        },
      },
    },
  } as unknown as GpuBackend;
  return { backend, destroyCount: () => destroyed };
}

const UNSUPPORTED: GpuBackendUnavailable = {
  supported: false,
  cause: "net-unsupported",
  reason: "test",
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createGpuBackendCache", () => {
  it("reuses the backend for a matching key and builds once", async () => {
    const cache = createGpuBackendCache();
    const { backend } = fakeBackend();
    let builds = 0;
    const build = () => {
      builds += 1;
      return Promise.resolve<GpuBackend | GpuBackendUnavailable>(backend);
    };

    const first = await cache.acquire("a", build);
    const second = await cache.acquire("a", build);

    expect(builds).toBe(1);
    expect(first).toBe(backend);
    expect(second).toBe(backend);
  });

  it("shares an in-flight build between concurrent acquires", async () => {
    const cache = createGpuBackendCache();
    const { backend } = fakeBackend();
    let builds = 0;
    let resolveBuild: (result: GpuBackend) => void = () => {};
    const build = () => {
      builds += 1;
      return new Promise<GpuBackend | GpuBackendUnavailable>((resolve) => {
        resolveBuild = resolve;
      });
    };

    const both = Promise.all([
      cache.acquire("a", build),
      cache.acquire("a", build),
    ]);
    resolveBuild(backend);
    expect(await both).toEqual([backend, backend]);
    expect(builds).toBe(1);
  });

  it("keeps a leased backend alive until the last release after eviction", async () => {
    const cache = createGpuBackendCache();
    const old = fakeBackend();
    const fresh = fakeBackend();

    const leaseA = await cache.acquire("a", () => Promise.resolve(old.backend));
    const leaseB = await cache.acquire("a", () => Promise.resolve(old.backend));
    expect(leaseA).toBe(leaseB);

    // A new key displaces the entry, but two leases still hold it.
    await cache.acquire("b", () => Promise.resolve(fresh.backend));
    await flush();
    expect(old.destroyCount()).toBe(0);

    cache.release(old.backend);
    await flush();
    expect(old.destroyCount()).toBe(0);
    cache.release(old.backend);
    await flush();
    expect(old.destroyCount()).toBe(1);
    expect(fresh.destroyCount()).toBe(0);
  });

  it("a release without eviction keeps the entry cached", async () => {
    const cache = createGpuBackendCache();
    const { backend, destroyCount } = fakeBackend();
    let builds = 0;
    const build = () => {
      builds += 1;
      return Promise.resolve<GpuBackend | GpuBackendUnavailable>(backend);
    };

    const lease = await cache.acquire("a", build);
    cache.release(lease as GpuBackend);
    await flush();
    expect(destroyCount()).toBe(0);

    await cache.acquire("a", build);
    expect(builds).toBe(1);
  });

  it("an evicting release removes and destroys once idle", async () => {
    const cache = createGpuBackendCache();
    const first = fakeBackend();
    const second = fakeBackend();
    let target = first;
    const build = () => Promise.resolve<GpuBackend>(target.backend);

    const lease = await cache.acquire("a", build);
    cache.release(lease as GpuBackend, { evict: true });
    await flush();
    expect(first.destroyCount()).toBe(1);

    target = second;
    await cache.acquire("a", build);
    expect(second.destroyCount()).toBe(0);
  });

  it("does not cache an unsupported build", async () => {
    const cache = createGpuBackendCache();
    const { backend } = fakeBackend();
    const results: (GpuBackend | GpuBackendUnavailable)[] = [
      UNSUPPORTED,
      backend,
    ];
    let builds = 0;
    const build = () => {
      builds += 1;
      return Promise.resolve(results.shift()!);
    };

    expect((await cache.acquire("a", build)).supported).toBe(false);
    expect((await cache.acquire("a", build)).supported).toBe(true);
    expect(builds).toBe(2);
  });

  it("destroys a backend released without ever entering the cache", () => {
    const cache = createGpuBackendCache();
    const { backend, destroyCount } = fakeBackend();
    cache.release(backend);
    expect(destroyCount()).toBe(1);
  });
});

describe("gpuBackendSetupKey", () => {
  const base = {
    sdcpn: { id: "net" },
    parameterValues: { rate: "1.5", size: "10" },
    runParameterIds: ["rate"],
    metricIds: ["m"],
    dt: 0.5,
    odeMethod: "rk4",
    initialMarking: { p: 10 },
  };

  it("ignores the values of per-run-buffered parameters", () => {
    const other = { ...base, parameterValues: { rate: "3.9", size: "10" } };
    expect(gpuBackendSetupKey(base)).toBe(gpuBackendSetupKey(other));
  });

  it("keys on baked values, marking, net identity, and metric set", () => {
    expect(gpuBackendSetupKey(base)).not.toBe(
      gpuBackendSetupKey({
        ...base,
        parameterValues: { rate: "1.5", size: "11" },
      }),
    );
    expect(gpuBackendSetupKey(base)).not.toBe(
      gpuBackendSetupKey({ ...base, initialMarking: { p: 11 } }),
    );
    expect(gpuBackendSetupKey(base)).not.toBe(
      gpuBackendSetupKey({ ...base, sdcpn: { id: "net" } }),
    );
    expect(gpuBackendSetupKey(base)).not.toBe(
      gpuBackendSetupKey({ ...base, metricIds: ["m", "n"] }),
    );
  });
});
