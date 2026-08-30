/**
 * CPU-vs-GPU parity harness: runs the same experiment request through the
 * worker-pool backend and the WebGPU backend and compares the streamed
 * distributions. The two use different random generators, so trajectories
 * differ by design; what must agree is the statistics — per-frame means
 * within a fraction of a percent, and similar final distributions.
 *
 * This is the committed form of the comparison behind the parity table in
 * the architecture docs' performance notes, which previously had to be
 * reproduced by hand. It needs a browser with WebGPU (real hardware; the
 * GPU column reports why when unavailable), and it logs a `gpu-parity:`
 * JSON line so scripts can extract the numbers.
 */
import { useEffect, useState } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type InitialMarking,
  type MonteCarloUserDefinedMetricFrame,
} from "@hashintel/petrinaut-core";
import {
  cafeQueue,
  dronePatrol,
  sirModel,
} from "@hashintel/petrinaut-core/examples";
import {
  createWorkerPoolExperimentBackend,
  type ExperimentBackend,
  type ExperimentRequest,
} from "@hashintel/petrinaut-core/experiments";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";
import { createWebGpuExperimentBackend } from "@hashintel/petrinaut-core/webgpu";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Dev / GpuParity",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type ParityModel = {
  id: string;
  title: string;
  sdcpn: (typeof sirModel)["petriNetDefinition"];
  initialMarking: InitialMarking;
  /** Place to measure, with a label for the report. */
  measure: { placeId: string; label: string };
};

const MODELS: ParityModel[] = [
  {
    id: "sir",
    title: "SIR",
    sdcpn: sirModel.petriNetDefinition,
    initialMarking: {
      place__susceptible: 190,
      place__infected: 10,
      place__recovered: 0,
    },
    measure: { placeId: "place__infected", label: "Infected" },
  },
  {
    id: "cafe-queue",
    title: "Café Queue",
    sdcpn: cafeQueue.petriNetDefinition,
    initialMarking: {
      place__waiting: 12,
      place__free_staff: 3,
      place__serving: 0,
      place__served: 0,
    },
    measure: { placeId: "place__served", label: "Served" },
  },
  {
    id: "drone-patrol",
    title: "Drone Patrol",
    sdcpn: dronePatrol.petriNetDefinition,
    initialMarking: {
      place__hangar: Array.from({ length: 10 }, () => ({
        battery: 100,
        altitude: 0,
      })),
      place__airborne: [],
    },
    measure: { placeId: "place__airborne", label: "Airborne" },
  },
];

type BackendReport = {
  frames: MonteCarloUserDefinedMetricFrame[];
  ms: number;
};

type ParityReport = {
  model: string;
  runCount: number;
  frames: number;
  cpuMs: number;
  gpuMs: number;
  /** Mean over frames of |cpuMean - gpuMean| / max(|cpuMean|, 1). */
  meanRelativeDifference: number;
  /** The worst frame's relative difference. */
  maxRelativeDifference: number;
  /** Kolmogorov–Smirnov statistic between the last common distributions. */
  finalKs: number;
};

function frameMean(frame: MonteCarloUserDefinedMetricFrame): number | null {
  if (frame.outputType !== "distribution") {
    return frame.value;
  }
  let weight = 0;
  let sum = 0;
  for (const [value, frequency] of frame.bins) {
    weight += frequency;
    sum += value * frequency;
  }
  return weight > 0 ? sum / weight : null;
}

function ksStatistic(
  left: MonteCarloUserDefinedMetricFrame,
  right: MonteCarloUserDefinedMetricFrame,
): number {
  if (
    left.outputType !== "distribution" ||
    right.outputType !== "distribution"
  ) {
    return Number.NaN;
  }
  const values = [
    ...new Set([...left.bins, ...right.bins].map(([value]) => value)),
  ].sort((a, b) => a - b);
  const total = (bins: readonly (readonly [number, number])[]) =>
    bins.reduce((sum, [, frequency]) => sum + frequency, 0);
  const leftTotal = total(left.bins);
  const rightTotal = total(right.bins);
  let leftCumulative = 0;
  let rightCumulative = 0;
  let ks = 0;
  for (const value of values) {
    leftCumulative +=
      left.bins.find(([binValue]) => binValue === value)?.[1] ?? 0;
    rightCumulative +=
      right.bins.find(([binValue]) => binValue === value)?.[1] ?? 0;
    ks = Math.max(
      ks,
      Math.abs(leftCumulative / leftTotal - rightCumulative / rightTotal),
    );
  }
  return ks;
}

async function runBackend(
  backend: ExperimentBackend,
  request: ExperimentRequest,
  /** The mount's live-handle slot, so cleanup can cancel an in-flight run. */
  active: { handle: { cancel: () => void } | null },
): Promise<BackendReport | { error: string }> {
  const assessment = await backend.assess(request);
  if (!assessment.eligible) {
    return {
      error: assessment.blockers.map((blocker) => blocker.message).join("; "),
    };
  }
  const instantiated = await assessment.instantiate({});
  if (!instantiated.ok) {
    return {
      error: instantiated.blockers.map((blocker) => blocker.message).join("; "),
    };
  }
  const handle = instantiated.handle;
  /* eslint-disable no-param-reassign -- `active` is the caller's live-handle
     slot; writing it is this function's contract with the cleanup. */
  active.handle = handle;
  /* eslint-enable no-param-reassign */
  const started = performance.now();
  const outcome = new Promise<string>((resolve) => {
    const off = handle.events.subscribe((event) => {
      off();
      resolve(event.type);
    });
  });
  handle.start();
  const terminal = await outcome;
  /* eslint-disable no-param-reassign -- see above: clearing the slot. */
  active.handle = null;
  /* eslint-enable no-param-reassign */
  const frames = [...handle.metrics.get().frames];
  const ms = performance.now() - started;
  handle.dispose();
  if (terminal !== "complete") {
    // Partial frames would render as plausible parity numbers; say what
    // actually happened instead.
    return { error: `run ended with '${terminal}' after ${Math.round(ms)} ms` };
  }
  return { frames, ms };
}

function compare(
  model: ParityModel,
  runCount: number,
  cpu: BackendReport,
  gpu: BackendReport,
): ParityReport {
  const byFrame = (frames: MonteCarloUserDefinedMetricFrame[]) =>
    new Map(frames.map((frame) => [frame.frameNumber, frame]));
  const cpuFrames = byFrame(cpu.frames);
  const gpuFrames = byFrame(gpu.frames);
  const common = [...cpuFrames.keys()]
    .filter((frameNumber) => gpuFrames.has(frameNumber))
    .sort((a, b) => a - b);

  let sum = 0;
  let worst = 0;
  let counted = 0;
  for (const frameNumber of common) {
    const cpuMean = frameMean(cpuFrames.get(frameNumber)!);
    const gpuMean = frameMean(gpuFrames.get(frameNumber)!);
    if (cpuMean === null || gpuMean === null) {
      continue;
    }
    const relative =
      Math.abs(cpuMean - gpuMean) / Math.max(Math.abs(cpuMean), 1);
    sum += relative;
    worst = Math.max(worst, relative);
    counted++;
  }
  const lastCommon = common.at(-1);
  return {
    model: model.title,
    runCount,
    frames: common.length,
    cpuMs: Math.round(cpu.ms),
    gpuMs: Math.round(gpu.ms),
    meanRelativeDifference: counted > 0 ? sum / counted : Number.NaN,
    maxRelativeDifference: worst,
    finalKs:
      lastCommon === undefined
        ? Number.NaN
        : ksStatistic(cpuFrames.get(lastCommon)!, gpuFrames.get(lastCommon)!),
  };
}

const tableStyle: React.CSSProperties = {
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
  borderCollapse: "collapse",
};
const cellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 14px 4px 0",
  borderBottom: "1px solid #e5e7eb",
};

const ParityStory = ({
  runCount,
  maxTime,
  dt,
  seed,
}: {
  runCount: number;
  maxTime: number;
  dt: number;
  seed: number;
}) => {
  const [rows, setRows] = useState<
    (ParityReport | { model: string; error: string })[]
  >([]);
  const [status, setStatus] = useState("running…");

  useEffect(() => {
    const walk: {
      cancelled: boolean;
      handle: { cancel: () => void } | null;
    } = { cancelled: false, handle: null };
    // Read through a call so the flow analysis cannot pin the flag to its
    // initial value: cleanup flips it from outside this closure.
    const isCancelled = () => walk.cancelled;
    const run = async () => {
      const results: (ParityReport | { model: string; error: string })[] = [];
      for (const model of MODELS) {
        const { artifacts } = compileHirArtifacts(model.sdcpn, undefined, {
          includeHir: true,
        });
        const request: ExperimentRequest = {
          sdcpn: model.sdcpn,
          extensions: DEFAULT_PETRINAUT_EXTENSIONS,
          initialMarking: model.initialMarking,
          parameterValues: {},
          seed,
          dt,
          maxTime,
          runCount,
          metricSpecs: [
            {
              kind: "placeTokenCountMean",
              id: "parity",
              label: model.measure.label,
              placeId: model.measure.placeId,
              runOutput: { type: "distribution", binning: "exact" },
            },
          ],
          hirArtifacts: artifacts,
        };
        const cpuBackend = createWorkerPoolExperimentBackend({
          createWorker: createMonteCarloWorker,
          shardCount: 4,
        });
        const gpuBackend = createWebGpuExperimentBackend();
        const cpu = await runBackend(cpuBackend, request, walk);
        if (isCancelled()) return;
        const gpu = await runBackend(gpuBackend, request, walk);
        if (isCancelled()) return;
        if ("error" in cpu) {
          results.push({ model: model.title, error: `CPU: ${cpu.error}` });
        } else if ("error" in gpu) {
          results.push({ model: model.title, error: `GPU: ${gpu.error}` });
        } else {
          results.push(compare(model, runCount, cpu, gpu));
        }
        setRows([...results]);
      }
      // eslint-disable-next-line no-console -- the scripted extraction channel
      console.log(`gpu-parity: ${JSON.stringify(results)}`);
      setStatus("done");
    };
    void run();
    return () => {
      walk.cancelled = true;
      // Without this, an abandoned mount's runs (a keystroke in a control
      // remounts the story) keep the pool and the GPU busy to completion.
      walk.handle?.cancel();
    };
  }, [dt, maxTime, runCount, seed]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {[
              "model",
              "frames",
              "cpu ms",
              "gpu ms",
              "mean |Δmean| rel",
              "max |Δmean| rel",
              "final KS",
            ].map((header) => (
              <th key={header} style={cellStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model}>
              {"error" in row ? (
                <>
                  <td style={cellStyle}>{row.model}</td>
                  <td style={cellStyle} colSpan={6}>
                    {row.error}
                  </td>
                </>
              ) : (
                <>
                  <td style={cellStyle}>{row.model}</td>
                  <td style={cellStyle}>{row.frames}</td>
                  <td style={cellStyle}>{row.cpuMs}</td>
                  <td style={cellStyle}>{row.gpuMs}</td>
                  <td style={cellStyle}>
                    {(row.meanRelativeDifference * 100).toFixed(3)}%
                  </td>
                  <td style={cellStyle}>
                    {(row.maxRelativeDifference * 100).toFixed(3)}%
                  </td>
                  <td style={cellStyle}>{row.finalKs.toFixed(4)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <span style={{ fontSize: 12, color: "#888" }}>{status}</span>
    </div>
  );
};

export const Parity: StoryObj<{
  runCount: number;
  maxTime: number;
  dt: number;
  seed: number;
}> = {
  args: { runCount: 2000, maxTime: 30, dt: 0.1, seed: 42 },
  argTypes: {
    runCount: { control: { type: "number", min: 100, max: 100_000 } },
    maxTime: { control: { type: "number", min: 5, max: 180 } },
    dt: { control: { type: "number", min: 0.01, max: 1 } },
    seed: { control: { type: "number" } },
  },
  render: (args) => <ParityStory key={JSON.stringify(args)} {...args} />,
};
