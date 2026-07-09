import { writeFileSync } from "node:fs";
/**
 * Simple simulator + experiments benchmark, runnable on both the HIR branch
 * and main (pre-HIR baseline) against the built package:
 *
 *   yarn build && node --expose-gc benches/bench.mjs [--json out.json]
 *
 * Feature-detects the HIR: when `../dist/hir.js` exists, artifacts are
 * compiled up-front and threaded (this branch); otherwise code strings are
 * passed as-is (main's Babel path). Everything runs in-process through the
 * public `createMonteCarloSimulator` API — no workers, so timings measure
 * the engine itself.
 *
 * Per scenario it reports: build time (compile + simulator construction),
 * run time (median of samples), heap growth, GC pauses, and a work checksum
 * (rng state + frames + token bytes per run) that MUST match across branches
 * — otherwise the comparison is measuring different work.
 */
import { performance, PerformanceObserver } from "node:perf_hooks";

const core = await import("../dist/index.js");
const hir = await import("../dist/hir.js").catch(() => null);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
};

const SAMPLES = Number(arg("--samples", 5));
const WARMUPS = flag("--no-warmup") ? 0 : 2;
const ONLY = arg("--only", null);

// ---------------------------------------------------------------------------
// Model builders
// ---------------------------------------------------------------------------

const color = (id, elements) => ({
  id,
  name: id,
  iconSlug: "circle",
  displayColor: "#f00",
  elements: elements.map(([name, type], index) => ({
    elementId: `${id}-e${index}`,
    name,
    type,
  })),
});

const place = (id, colorId, overrides = {}) => ({
  id,
  name: id,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  ...overrides,
});

const baseNet = () => ({
  types: [],
  places: [],
  transitions: [],
  differentialEquations: [],
  parameters: [],
  metrics: [],
});

function tokens(count, make) {
  return Array.from({ length: count }, (_, index) => make(index));
}

/** 1 place x N tokens, oscillator ODE, no transitions. Dynamics-dominated. */
function dynamicsScenario(tokenCount) {
  const sdcpn = baseNet();
  sdcpn.types.push(
    color("Particle", [
      ["x", "real"],
      ["v", "real"],
    ]),
  );
  sdcpn.differentialEquations.push({
    id: "de1",
    name: "Oscillator",
    colorId: "Particle",
    code: `export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x, v }) => ({ x: v, v: -0.5 * x }));
});`,
  });
  sdcpn.places.push(
    place("Field", "Particle", {
      dynamicsEnabled: true,
      differentialEquationId: "de1",
    }),
    place("Sink", null),
  );
  // Structurally enabled but never-firing transition: without one, a net
  // with no fireable transition deadlocks at frame 1 and dynamics never run.
  sdcpn.transitions.push({
    id: "keepalive",
    name: "keepalive",
    lambdaType: "predicate",
    inputArcs: [{ placeId: "Field", weight: 1, type: "read" }],
    outputArcs: [{ placeId: "Sink", weight: 1 }],
    lambdaCode: "export default Lambda((input, parameters) => false);",
    transitionKernelCode: "",
    x: 0,
    y: 0,
  });
  return {
    name: `dynamics ${tokenCount} tokens x 200 steps`,
    sdcpn,
    initialMarking: {
      Field: tokens(tokenCount, (index) => ({
        x: 1 + (index % 7) * 0.1,
        v: 0,
      })),
      Sink: 0,
    },
    dt: 0.1,
    maxTime: 20,
    runCount: 1,
  };
}

/** N tokens, one rarely-firing token-dependent lambda: per step the engine
 * enumerates ~N combinations and calls the rate per combination. */
function lambdaScenario(tokenCount) {
  const sdcpn = baseNet();
  sdcpn.types.push(
    color("Item", [
      ["x", "real"],
      ["priority", "real"],
      ["active", "boolean"],
    ]),
  );
  sdcpn.places.push(place("Pool", "Item"), place("Done", null));
  sdcpn.transitions.push({
    id: "t1",
    name: "Consume",
    lambdaType: "stochastic",
    inputArcs: [{ placeId: "Pool", weight: 1, type: "standard" }],
    outputArcs: [{ placeId: "Done", weight: 1 }],
    lambdaCode: `export default Lambda((input, parameters) => {
  const { x, priority, active } = input.Pool[0];
  if (!active) return 0;
  return x > 100 ? 1 : priority * 0.000001;
});`,
    transitionKernelCode: "",
    x: 0,
    y: 0,
  });
  return {
    name: `lambda ${tokenCount} combinations x 200 steps`,
    sdcpn,
    initialMarking: {
      Pool: tokens(tokenCount, (index) => ({
        x: (index % 50) * 0.1,
        priority: 0.5,
        active: index % 2 === 0,
      })),
      Done: 0,
    },
    dt: 0.1,
    maxTime: 20,
    runCount: 1,
  };
}

/** Two always-firing transitions cycling tokens A<->B; kernels rewrite
 * attributes with a distribution, a string and an integer. Kernel-dominated. */
function kernelScenario(steps) {
  const sdcpn = baseNet();
  sdcpn.types.push(
    color("Job", [
      ["value", "real"],
      ["even", "boolean"],
      ["hops", "integer"],
    ]),
  );
  sdcpn.places.push(place("A", "Job"), place("B", "Job"));
  const kernel = (
    from,
    to,
  ) => `export default TransitionKernel((input, parameters) => {
  const noise = Distribution.Gaussian(0, 0.01);
  return {
    ${to}: [{
      value: noise.map((v) => input.${from}[0].value + v),
      even: input.${from}[0].hops % 2 === 0,
      hops: input.${from}[0].hops + 1,
    }],
  };
});`;
  const transition = (id, from, to) => ({
    id,
    name: id,
    lambdaType: "stochastic",
    inputArcs: [{ placeId: from, weight: 1, type: "standard" }],
    outputArcs: [{ placeId: to, weight: 1 }],
    lambdaCode: `export default Lambda((input, parameters) => Infinity);`,
    transitionKernelCode: kernel(from, to),
    x: 0,
    y: 0,
  });
  sdcpn.transitions.push(
    transition("ab", "A", "B"),
    transition("ba", "B", "A"),
  );
  return {
    name: `kernel 2 firings x ${steps} steps`,
    sdcpn,
    initialMarking: {
      A: tokens(40, (index) => ({ value: index, even: true, hops: 0 })),
      B: tokens(40, (index) => ({ value: -index, even: false, hops: 1 })),
    },
    dt: 0.1,
    maxTime: steps * 0.1,
    runCount: 1,
  };
}

/** Monte-Carlo experiment: R runs with dynamics + 3 expression metrics
 * evaluated every frame over a large place. Experiments/metrics-dominated. */
function experimentScenario(runCount, tokenCount) {
  const base = dynamicsScenario(tokenCount);
  const metricSpecs = [
    {
      kind: "expression",
      id: "energy",
      label: "energy",
      code: `const field = state.places.Field.tokens;
return field.reduce((sum, t) => sum + t.x * t.x + t.v * t.v, 0);`,
    },
    {
      kind: "expression",
      id: "mean-x",
      label: "mean-x",
      code: `const field = state.places.Field.tokens;
if (field.length === 0) return 0;
return field.reduce((sum, t) => sum + t.x, 0) / field.length;`,
    },
    {
      kind: "expression",
      id: "count",
      label: "count",
      code: `return state.places.Field.count;`,
    },
  ];
  return {
    ...base,
    name: `experiment ${runCount} runs x ${tokenCount} tokens x 100 steps, 3 metrics`,
    maxTime: 10,
    runCount,
    metricSpecs,
  };
}

const SCENARIOS = [
  dynamicsScenario(10_000),
  lambdaScenario(1_000),
  kernelScenario(2_000),
  experimentScenario(Number(arg("--runs", 20)), 2_000),
];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function buildSimulator(scenario) {
  const config = {
    sdcpn: scenario.sdcpn,
    initialMarking: scenario.initialMarking,
    parameterValues: {},
    seed: 1234,
    dt: scenario.dt,
    maxTime: scenario.maxTime,
    runCount: scenario.runCount,
  };

  let metricSpecs = scenario.metricSpecs;
  if (hir) {
    // This branch: user code must be precompiled to HIR artifacts.
    const sdcpnForCompile = metricSpecs
      ? {
          ...scenario.sdcpn,
          metrics: metricSpecs.map((spec) => ({
            id: spec.id,
            name: spec.label,
            code: spec.code,
          })),
        }
      : scenario.sdcpn;
    const { artifacts, failures } = hir.compileHirArtifacts(sdcpnForCompile);
    if (failures.length > 0) {
      throw new Error(
        `HIR compile failures: ${JSON.stringify(failures, null, 2)}`,
      );
    }
    config.hirArtifacts = artifacts;
    if (metricSpecs) {
      metricSpecs = metricSpecs.map((spec) => ({
        ...spec,
        artifact: artifacts.metrics[spec.id],
      }));
    }
  }

  if (metricSpecs) {
    const configs = core.createMonteCarloUserDefinedMetricConfigsFromSpecs(
      metricSpecs,
      scenario.sdcpn,
    );
    config.metrics = configs.map((metricConfig) =>
      core.createMonteCarloUserDefinedMetric(metricConfig),
    );
  }

  return core.createMonteCarloSimulator(config);
}

function checksum(simulator) {
  let acc = 0n;
  for (const run of simulator.getSummaries()) {
    acc =
      acc * 31n +
      BigInt(run.rngState) * 7n +
      BigInt(run.frameNumber) * 3n +
      BigInt(run.tokenValueCount ?? 0);
  }
  return acc.toString(16);
}

function sample(scenario) {
  globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  let gcCount = 0;
  let gcMs = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gcCount += 1;
      gcMs += entry.duration;
    }
  });
  observer.observe({ entryTypes: ["gc"] });

  const buildStart = performance.now();
  const simulator = buildSimulator(scenario);
  const buildEnd = performance.now();

  const result = simulator.runUntilComplete({ maxBatches: 1_000_000 });
  const runEnd = performance.now();

  observer.disconnect();
  const heapAfter = process.memoryUsage().heapUsed;

  if (result.erroredRuns > 0) {
    const summary = simulator.getSummaries().find((run) => run.error);
    throw new Error(`run errored: ${summary?.error}`);
  }

  return {
    buildMs: buildEnd - buildStart,
    runMs: runEnd - buildEnd,
    heapDeltaMb: (heapAfter - heapBefore) / 1024 / 1024,
    gcCount,
    gcMs,
    checksum: checksum(simulator),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------------------
// Compile-time mode: isolate user-code compilation (no simulation).
// HIR branch: compileHirArtifacts (lower + typecheck + emit for every item).
// Baseline: Babel compileUserCode per item + compileMetric per metric.
// ---------------------------------------------------------------------------
if (flag("--compile")) {
  const experiment = experimentScenario(1, 10);
  const kernelNet = kernelScenario(1);
  const lambdaNet = lambdaScenario(10);
  const sdcpn = {
    ...experiment.sdcpn,
    types: [
      ...experiment.sdcpn.types,
      ...lambdaNet.sdcpn.types,
      ...kernelNet.sdcpn.types,
    ],
    places: [
      ...experiment.sdcpn.places,
      ...lambdaNet.sdcpn.places,
      ...kernelNet.sdcpn.places,
    ],
    transitions: [
      ...experiment.sdcpn.transitions,
      ...lambdaNet.sdcpn.transitions,
      ...kernelNet.sdcpn.transitions,
    ],
    differentialEquations: experiment.sdcpn.differentialEquations,
    metrics: experiment.metricSpecs.map((spec) => ({
      id: spec.id,
      name: spec.label,
      code: spec.code,
    })),
  };
  // 1 dynamics + 4 lambdas + 2 kernels + 3 metrics = 10 compiled programs.
  const compileOnce = hir
    ? () => {
        const { failures } = hir.compileHirArtifacts(sdcpn);
        if (failures.length > 0) throw new Error(JSON.stringify(failures));
      }
    : () => {
        for (const de of sdcpn.differentialEquations) {
          core.compileUserCode(de.code, "Dynamics");
        }
        for (const transition of sdcpn.transitions) {
          if (transition.lambdaCode.trim() !== "") {
            core.compileUserCode(transition.lambdaCode, "Lambda");
          }
          if (transition.transitionKernelCode.trim() !== "") {
            core.compileUserCode(
              transition.transitionKernelCode,
              "TransitionKernel",
            );
          }
        }
        for (const metric of sdcpn.metrics) {
          const compiled = core.compileMetric(metric);
          if (!compiled.ok) throw new Error(compiled.error);
        }
      };

  const coldStart = performance.now();
  compileOnce();
  const coldMs = performance.now() - coldStart;

  const times = [];
  for (let index = 0; index < 50; index += 1) {
    const start = performance.now();
    compileOnce();
    times.push(performance.now() - start);
  }
  const sorted = [...times].sort((a, b) => a - b);
  console.log(
    `${hir ? "hir" : "baseline"}  compile 10 programs: ` +
      `cold ${coldMs.toFixed(1)}ms  warm median ${sorted[25].toFixed(2)}ms  ` +
      `min ${sorted[0].toFixed(2)}ms`,
  );
  process.exit(0);
}

const results = [];
const selected = ONLY === null ? SCENARIOS : [SCENARIOS[Number(ONLY)]];
for (const scenario of selected) {
  for (let index = 0; index < WARMUPS; index += 1) {
    sample(scenario);
  }
  const samples = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    samples.push(sample(scenario));
  }
  const row = {
    scenario: scenario.name,
    variant: hir ? "hir" : "baseline",
    buildMs: median(samples.map((entry) => entry.buildMs)),
    runMs: median(samples.map((entry) => entry.runMs)),
    runMsMin: Math.min(...samples.map((entry) => entry.runMs)),
    runMsMax: Math.max(...samples.map((entry) => entry.runMs)),
    heapDeltaMb: median(samples.map((entry) => entry.heapDeltaMb)),
    gcCount: median(samples.map((entry) => entry.gcCount)),
    gcMs: median(samples.map((entry) => entry.gcMs)),
    checksum: samples[0].checksum,
  };
  results.push(row);
  console.log(
    `${row.variant}  ${row.scenario}\n` +
      `  build ${row.buildMs.toFixed(1)}ms  run ${row.runMs.toFixed(1)}ms ` +
      `(min ${row.runMsMin.toFixed(1)} max ${row.runMsMax.toFixed(1)})  ` +
      `heap ${row.heapDeltaMb.toFixed(1)}MB  gc ${row.gcCount}x/${row.gcMs.toFixed(1)}ms  ` +
      `checksum ${row.checksum}`,
  );
}

const jsonFlag = process.argv.indexOf("--json");
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(results, null, 2));
}
