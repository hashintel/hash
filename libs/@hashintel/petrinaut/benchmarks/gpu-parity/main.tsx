/**
 * CPU-vs-GPU parity harness. It runs one experiment through the worker-pool
 * backend and the WebGPU backend and compares the streamed distributions. The
 * two use different random generators, so trajectories differ by design. What
 * must agree is the statistics: per-frame means within a fraction of a
 * percent, and similar final distributions.
 *
 * It needs a browser with WebGPU on real hardware. Without one the CPU column
 * is still measured and the GPU cells say why the backend is unavailable.
 *
 * The experiment is set in the query string: `runs` (2000), `maxTime` (30),
 * `dt` (0.1) and `seed` (42).
 */
import { createRoot } from "react-dom/client";

import { GpuParityPage } from "./gpu-parity-page";

const query = new URLSearchParams(location.search);

createRoot(document.getElementById("root")!).render(
  <GpuParityPage
    settings={{
      runCount: Number(query.get("runs") ?? 2000),
      maxTime: Number(query.get("maxTime") ?? 30),
      dt: Number(query.get("dt") ?? 0.1),
      seed: Number(query.get("seed") ?? 42),
    }}
  />,
);
