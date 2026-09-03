import { afterEach, describe, expect, it } from "vitest";

import {
  describeAllocationFailure,
  describeBufferOverflow,
  requestGpuDevice,
  uniformBufferSize,
} from "./device";

/**
 * The user-facing wall on run count. A device made without `requiredLimits` gets
 * the WebGPU defaults — 128 MiB per binding, 256 MiB per buffer — which is the
 * floor every implementation must support, not the hardware's capability. An
 * Apple metal-3 adapter reports 4096 MiB for both.
 */
describe("describeBufferOverflow", () => {
  const DEFAULT_LIMITS = {
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxBufferSize: 256 * 1024 * 1024,
  };

  it("accepts any run count, since tiling absorbs it", () => {
    // ~311 GB of total run state at 1024 bytes per run runs as sequential tiles.
    expect(
      describeBufferOverflow({
        histBytes: 1024,
        bytesPerRun: 1024,
        limits: DEFAULT_LIMITS,
      }),
    ).toBeNull();
  });

  it("refuses a single run larger than the buffer ceiling", () => {
    expect(
      describeBufferOverflow({
        histBytes: 1024,
        bytesPerRun: 200 * 1024 * 1024,
        limits: DEFAULT_LIMITS,
      }),
    ).toMatch(/One run's state needs 210 MB/);
  });

  it("reports the histogram separately, since fewer runs would not help", () => {
    expect(
      describeBufferOverflow({
        histBytes: 300 * 1e6,
        bytesPerRun: 1024,
        limits: DEFAULT_LIMITS,
      }),
    ).toMatch(/Metric histograms need 300 MB/);
  });
});

describe("requestGpuDevice", () => {
  const original = Reflect.getOwnPropertyDescriptor(globalThis, "navigator");

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, "navigator", original);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  /** Records what the caller asked for, and honours it the way a real device does. */
  function stubAdapter(adapterLimits: Record<string, number>) {
    const requested: GPUDeviceDescriptor[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: () =>
            Promise.resolve({
              info: { vendor: "apple", architecture: "metal-3" },
              limits: adapterLimits,
              requestDevice: (descriptor: GPUDeviceDescriptor = {}) => {
                requested.push(descriptor);
                return Promise.resolve({
                  limits: {
                    // A device gets the WebGPU defaults for anything it does not
                    // ask for, regardless of what the adapter supports.
                    maxStorageBufferBindingSize: 128 * 1024 * 1024,
                    maxBufferSize: 256 * 1024 * 1024,
                    ...descriptor.requiredLimits,
                  },
                });
              },
            }),
        },
      },
    });
    return requested;
  }

  it("asks for the adapter's limits, not the WebGPU defaults", async () => {
    // Without `requiredLimits` the device is capped at 128 MiB per binding on
    // hardware that offers 4096 MiB — a factor of 32. Requesting exactly what
    // the adapter reports is always valid; only asking for more is rejected.
    const requested = stubAdapter({
      maxStorageBufferBindingSize: 4096 * 1024 * 1024,
      maxBufferSize: 4096 * 1024 * 1024,
    });

    const result = await requestGpuDevice();

    expect(requested[0]?.requiredLimits).toStrictEqual({
      maxStorageBufferBindingSize: 4096 * 1024 * 1024,
      maxBufferSize: 4096 * 1024 * 1024,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handle.device.limits.maxStorageBufferBindingSize).toBe(
      4096 * 1024 * 1024,
    );
  });

  it("does not ask for more than the adapter reports, which would be rejected", async () => {
    // A modest adapter must still get a device: requesting a hard-coded ceiling
    // would make `requestDevice` reject and lose the GPU entirely.
    const requested = stubAdapter({
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
    });

    const result = await requestGpuDevice();

    expect(requested[0]?.requiredLimits).toStrictEqual({
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
    });
    expect(result.ok).toBe(true);
  });
});

/**
 * Dawn reports an out-of-memory `createBuffer` by returning an error buffer
 * rather than throwing, so allocation looks successful and the first thing the
 * user sees is `mapAsync` failing with "[Invalid Buffer] is invalid due to a
 * previous error" — three operations downstream, after the whole simulation has
 * run. The real message lives only inside an error scope.
 */
describe("describeAllocationFailure", () => {
  const DAWN_OOM =
    "Failed to allocate memory for buffer mapping\n    at APICreateErrorBuffer (../../third_party/dawn/src/dawn/native/Device.cpp:1573)\n";

  it("leads with the run arithmetic, not Dawn's internals", () => {
    const reason = describeAllocationFailure({
      message: DAWN_OOM,
      stateBytes: 3112 * 1_000_000,
      bytesPerRun: 3112,
      runCount: 1_000_000,
    });

    // Measured: 3112 B/run x 1e6 runs = 2.90 GiB, which fails to allocate on
    // an adapter reporting maxBufferSize = 4 GiB.
    expect(reason).toMatch(
      /^The GPU could not allocate memory for a tile of 1000000 runs/,
    );
    expect(reason).toContain("3112 bytes per run");
    expect(reason).toContain("2.90 GiB of run state in one device buffer");
    // What the author can change: the per-run size, or the run count when
    // the whole experiment fits one tile.
    expect(reason).toMatch(/fewer runs/);
    expect(reason).toMatch(/token capacities/);
    // Readback is a compact summary and the histogram, not the run state.
    expect(reason).not.toMatch(/host-visible|reading it back/);
  });

  it("keeps the underlying message, which separates OOM from a validation bug", () => {
    const reason = describeAllocationFailure({
      message: DAWN_OOM,
      stateBytes: 1,
      bytesPerRun: 1,
      runCount: 1,
    });

    expect(reason).toContain("Failed to allocate memory for buffer mapping");
  });
});

describe("uniformBufferSize", () => {
  it("pads the config block to the 16-byte struct size for every metric count", () => {
    // Five fixed words plus two per metric: 20, 28, 36, 44 and 52 bytes of
    // data, each an odd word count the uniform struct rounds up.
    const configBytes = [0, 1, 2, 3, 4].map((metricCount) =>
      uniformBufferSize((5 + 2 * metricCount) * 4),
    );

    expect(configBytes).toEqual([32, 32, 48, 48, 64]);
    for (const bytes of configBytes) {
      expect(bytes % 16).toBe(0);
    }
  });
});
