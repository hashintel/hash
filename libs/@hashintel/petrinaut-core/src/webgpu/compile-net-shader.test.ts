import { describe, expect, it } from "vitest";

import { dronePatrol } from "../examples/drone-patrol";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { sirModel } from "../examples/sir-model";
import { vaccinationCampaign } from "../examples/vaccination-campaign";
import { compileHirArtifacts } from "../hir";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { resolveNetParameterValues } from "../parameter-values";
import {
  compileNetShader,
  GPU_HISTOGRAM_MAX_BINS,
  histogramBinCount,
} from "./compile-net-shader";
import { assessGpuEligibility } from "./eligibility";
import { hirFromArtifacts } from "./hir-from-artifacts";

import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";
import type { GpuMetricSpec, GpuOdeMethod } from "./compile-net-shader";

/** A metric sampling one place's token count. */
const placeCount = (id: string, placeId: string): GpuMetricSpec => ({
  id,
  integer: true,
  sample: { kind: "placeCount", placeId },
});

/**
 * An expression metric over a lowered body. The shader does not read
 * `integer` — it only labels bins on the host — so it is fixed here.
 */
const expression = (id: string, hir: HirFunction): GpuMetricSpec => ({
  id,
  integer: false,
  sample: { kind: "expression", hir },
});

/** One of the net's own metrics, through the artifact path the gate uses. */
const modelMetric = (sdcpn: SDCPN, metricId: string): GpuMetricSpec => {
  const hir = compileHirArtifacts(sdcpn, undefined, { includeHir: true })
    .artifacts.metrics[metricId]?.hir;
  if (hir === undefined) {
    throw new Error(`metric ${metricId} compiled without HIR`);
  }
  return expression(metricId, hir);
};

/** A metric body lowered without a net context, for shapes no example has. */
const loweredMetric = (id: string, code: string): GpuMetricSpec => {
  const result = lowerTypeScriptToHir(code, "metric");
  if (!result.ok) {
    throw new Error(
      `test metric did not lower: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return expression(id, result.fn);
};

function compileFor(
  sdcpn: SDCPN,
  {
    odeMethod = "rk4",
    metrics = [] as GpuMetricSpec[],
    dt = 0.1,
    framesPerDispatch = 300,
    runParameters,
  }: {
    odeMethod?: GpuOdeMethod;
    metrics?: GpuMetricSpec[];
    dt?: number;
    framesPerDispatch?: number;
    runParameters?: readonly string[];
  } = {},
) {
  const eligibility = assessGpuEligibility(sdcpn);
  if (!eligibility.eligible) {
    throw new Error(
      `net not eligible: ${eligibility.reasons.map((r) => r.code).join(", ")}`,
    );
  }
  const lowered = hirFromArtifacts(
    sdcpn,
    compileHirArtifacts(sdcpn, undefined, { includeHir: true }).artifacts,
  );
  return compileNetShader({
    sdcpn,
    profile: eligibility.profile,
    parameterValues: resolveNetParameterValues(sdcpn.parameters, {}, true),
    lambdaHir: lowered.lambdas,
    dynamicsHir: lowered.dynamics,
    kernelHir: lowered.kernels,
    dt,
    framesPerDispatch,
    metrics,
    odeMethod,
    ...(runParameters === undefined ? {} : { runParameters }),
  });
}

const sir = sirModel.petriNetDefinition;
const satellites = probabilisticSatellitesSDCPN.petriNetDefinition;
const vaccination = vaccinationCampaign.petriNetDefinition;

describe("per-run parameters", () => {
  it("reads a swept parameter from the per-run buffer and keeps the rest inlined", () => {
    const result = compileFor(sir, { runParameters: ["infection_rate"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shader.runParameterIds).toEqual(["infection_rate"]);
    expect(result.shader.wgsl).toContain(
      "@group(0) @binding(4) var<storage, read> run_params: array<f32>;",
    );
    expect(result.shader.wgsl).toContain(
      "run_param_0 = run_params[run_index * 1u + 0u];",
    );
    // The swept parameter reads the hoisted per-run value...
    expect(result.shader.wgsl).toContain("run_param_0");
    // ...while the fixed one stays a literal (recovery_rate defaults to 1).
    expect(result.shader.wgsl).toContain("1.0");
  });

  it("lays several swept parameters out run-major in declaration order", () => {
    const result = compileFor(sir, {
      runParameters: ["infection_rate", "recovery_rate"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shader.wgsl).toContain(
      "run_param_0 = run_params[run_index * 2u + 0u];",
    );
    expect(result.shader.wgsl).toContain(
      "run_param_1 = run_params[run_index * 2u + 1u];",
    );
  });

  it("declares no per-run binding when nothing varies per run", () => {
    const result = compileFor(sir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shader.runParameterIds).toEqual([]);
    expect(result.shader.wgsl).not.toContain("run_params");
  });

  it("refuses a per-run parameter the net does not declare", () => {
    const result = compileFor(sir, { runParameters: ["not_a_parameter"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not a parameter of this net");
  });
});

describe("compileNetShader", () => {
  it("compiles the uncoloured SIR net", () => {
    const result = compileFor(sir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 counts + 2 firings + rng + status.
    expect(result.shader.stateWordsPerRun).toBe(7);
    expect(result.shader.compiledLambdas).toStrictEqual([
      "transition__infection",
      "transition__recovery",
    ]);
  });

  it("declares one invocation-per-run entry point", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain("@compute @workgroup_size(256)");
    expect(result.shader.wgsl).toContain("fn step_runs(");
    // The frame loop must be inside the shader; a host-driven per-frame dispatch
    // would cost more in readback than the work itself.
    expect(result.shader.wgsl).toContain(
      "for (var frame: u32 = 0u; frame < config.chunk_frames;",
    );
  });

  it("consumes the acceptance draw every enabled frame, fired or not", () => {
    // This mirrors the CPU engine, where `advance-run.ts` commits the run's
    // RNG state after every transition evaluation ("Every evaluation's
    // randomness is consumed, fired or not") and the acceptance is a
    // memoryless per-frame Bernoulli over dt. Holding the draw until it
    // fires accumulated the hazard over a transition's idle window instead —
    // structurally divergent for any intermittently enabled net.
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain("let u = rng_next_f32(&rng_state);");
    expect(result.shader.wgsl).not.toContain("rng_candidate");
    expect(result.shader.wgsl).toContain("accepts_firing");
  });

  it("applies removals immediately and additions at end of frame", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);
    const wgsl = result.shader.wgsl;

    // Infection consumes one Susceptible immediately...
    expect(wgsl).toContain("counts[0u] = counts[0u] - 1u;");
    // ...but its two Infected outputs are deferred, so a later transition in the
    // same frame cannot consume them.
    expect(wgsl).toContain("pending[1u] = pending[1u] + 2;");
    expect(wgsl).toContain(
      "counts[1u] = u32(max(0, i32(counts[1u]) + pending[1u]));",
    );
  });

  it("marks a run deadlocked only when nothing fired and nothing is enabled", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain(
      "if (!any_fired && !any_enabled) { status = 1u; }",
    );
  });

  it.each([
    ["euler", 1],
    ["rk2", 2],
    ["rk4", 4],
  ] as const)("emits %s with %i derivative stages", (odeMethod, stages) => {
    // A place whose token carries a real attribute with a differential equation.
    const net: SDCPN = {
      types: [
        {
          id: "c",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#0f0",
          elements: [{ elementId: "v", name: "v", type: "real" }],
        },
      ],
      places: [
        {
          id: "pool",
          name: "Pool",
          colorId: "c",
          capacity: 4,
          dynamicsEnabled: true,
          differentialEquationId: "eq",
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t",
          name: "T",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => false);",
          transitionKernelCode: "export default TransitionKernel(() => ({}));",
          x: 0,
          y: 0,
        },
      ],
      differentialEquations: [
        {
          id: "eq",
          name: "decay",
          colorId: "c",
          code: "export default Dynamics((tokens) => tokens.map((token) => ({ v: -token.v })));",
        },
      ],
      parameters: [],
    };

    const result = compileFor(net, { odeMethod });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wgsl = result.shader.wgsl;
    for (let stage = 1; stage <= stages; stage++) {
      expect(wgsl).toContain(`k${stage}_0`);
    }
    expect(wgsl).not.toContain(`k${stages + 1}_0`);
    // RK4's four stages live in one invocation because a token's derivative
    // depends only on that token — no extra dispatch, no shared memory.
    if (odeMethod === "rk4") {
      expect(wgsl).toContain(
        "(DT / 6.0) * (k1_0 + 2.0 * k2_0 + 2.0 * k3_0 + k4_0)",
      );
    }
  });

  it("reduces metrics in workgroup memory rather than global atomics", () => {
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) throw new Error(result.reason);
    const wgsl = result.shader.wgsl;

    // Measured 2x faster than hitting global atomics directly, because runs in a
    // workgroup collide on the same bin constantly.
    expect(wgsl).toContain("var<workgroup> local_hist");
    expect(wgsl).toContain("atomicAdd(&local_hist[");
    expect(wgsl).toContain("workgroupBarrier();");
    expect(result.shader.metricIds).toStrictEqual(["infected"]);
  });

  it("samples each frame before stepping it, so row 0 holds the initial marking", () => {
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) throw new Error(result.reason);
    const wgsl = result.shader.wgsl;

    // Row f holds frame f, the CPU's numbering: the sample reads the registers
    // as the iteration starts, before `running` gates this frame's step. The
    // guard is `in_range`, not `running`, because `running` is not yet bound.
    const sampleAt = wgsl.indexOf("if (in_range && status == 0u) {");
    const runningAt = wgsl.indexOf("let running = in_range && status == 0u");
    expect(sampleAt).toBeGreaterThan(-1);
    expect(runningAt).toBeGreaterThan(sampleAt);
    expect(wgsl).toContain("atomicAdd(&hist[absolute_frame * ");
    expect(wgsl).not.toContain("if (running && status == 0u) {");
  });

  it("never writes the histogram's last row, so sampling first costs no buffer", () => {
    // The buffer holds `frame_limit` rows. Sampling after the step left row
    // `frame_limit - 1` empty: every run still running takes status 2 at the
    // frame limit inside the end-of-frame fold, and a finished run is never
    // sampled. Sampling first fills rows 0..frame_limit - 1 of the same
    // buffer, as long as that status flip still follows the sample.
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) throw new Error(result.reason);
    const wgsl = result.shader.wgsl;

    const sampleAt = wgsl.indexOf("if (in_range && status == 0u) {");
    const foldAt = wgsl.indexOf(
      "    if (running) {\n      counts[0u] = u32(max(0, i32(counts[0u]) + pending[0u]));",
    );
    const foldEnd = wgsl.indexOf("\n    }\n", foldAt);
    const completeAt = wgsl.indexOf(
      "if (absolute_frame + 1u >= config.frame_limit) { status = 2u; }",
    );
    expect(foldAt).toBeGreaterThan(sampleAt);
    expect(completeAt).toBeGreaterThan(foldAt);
    expect(completeAt).toBeLessThan(foldEnd);
  });

  it("emits no histogram machinery when there are no metrics", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).not.toContain("local_hist");
    expect(result.shader.wgsl).not.toContain("fn f32_order_key(");
    expect(result.shader.wgsl).not.toContain("fn window_bin(");
  });

  it("reports a reason rather than throwing when a metric names an unknown place", () => {
    const result = compileFor(sir, {
      metrics: [placeCount("m", "does-not-exist")],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/unknown place/);
  });

  it("inlines dt as the f32 the device will hold", () => {
    const result = compileFor(sir, { dt: 0.1 });
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain(
      "const DT: f32 = 0.10000000149011612;",
    );
  });
});

/**
 * The host reads a run's RNG state and status out of the state buffer by word
 * offset. Those offsets used to be derived by counting back from
 * `stateWordsPerRun`, which is only correct for a net with no token attributes:
 * the layout is `counts | firings | rng | status | tokens`, so on a
 * typed net the seed landed in a token attribute and the status came out of the
 * token array — leaving every run sharing one RNG stream while reporting
 * confidently. These pin the offsets against the shader's own writes.
 */
describe("histogram sizing", () => {
  it("spends the baseline workgroup budget on an unbounded metric", () => {
    // One metric: floor((16384 − 8) / 4) = 4094 slots, capped at the max.
    expect(histogramBinCount(1, null)).toBe(GPU_HISTOGRAM_MAX_BINS);
    expect(histogramBinCount(3, null)).toBe(GPU_HISTOGRAM_MAX_BINS);
    // Four metrics no longer reach the cap: the min/max reduction's eight
    // bytes per metric share the budget.
    expect(histogramBinCount(4, null)).toBe(1022);
  });

  it("shrinks bins as metrics divide the workgroup budget", () => {
    expect(histogramBinCount(5, null)).toBe(817);
    // 17 metrics used to overflow the 16 KB budget at a fixed 256 bins and
    // fail pipeline creation; now they fit at fewer bins each — histogram
    // plus the per-metric min/max atomics.
    expect(histogramBinCount(17, null)).toBe(238);
    expect(17 * histogramBinCount(17, null) * 4 + 17 * 8).toBeLessThanOrEqual(
      16384,
    );
  });

  it("sizes to the sampled places' count ceiling plus a top bin", () => {
    expect(histogramBinCount(1, 16)).toBe(17);
    expect(histogramBinCount(1, 0)).toBe(2);
    expect(histogramBinCount(1, 100000)).toBe(GPU_HISTOGRAM_MAX_BINS);
  });

  it("gives an unbounded sampled place the full budget in a compiled shader", () => {
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.shader.histogramBins).toBe(GPU_HISTOGRAM_MAX_BINS);
    expect(result.shader.wgsl).toContain(
      `const HIST_BINS: u32 = ${GPU_HISTOGRAM_MAX_BINS}u;`,
    );
  });

  it("sizes a typed sampled place's bins from its capacity", () => {
    const result = compileFor(dronePatrol.petriNetDefinition, {
      metrics: [placeCount("airborne", "place__airborne")],
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    // Capacity 16 → counts 0..16 plus nothing else representable.
    expect(result.shader.histogramBins).toBe(17);
  });

  it("bins through a per-metric f32 window carried as uniforms", () => {
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const { wgsl } = result.shader;
    // The window lives in the config, so recalibration needs no recompile;
    // it is f32 for every metric, so one sampling path serves counts and
    // real-valued expressions alike.
    expect(wgsl).toContain("m0_lo: f32,");
    expect(wgsl).toContain("m0_stride: f32,");
    expect(wgsl).toContain("fn f32_order_key(");
    expect(wgsl).toContain("fn window_bin(");
    // A place count is sampled as the f32 of its u32, exact below 2^24.
    expect(wgsl).toContain("let v0: f32 = f32(counts[1u]);");
    // The observed range travels as order-preserving keys through the u32
    // atomics; the bin is settled against the window's exact edges.
    expect(wgsl).toContain("atomicMin(&local_min[0u], k0);");
    expect(wgsl).toContain(
      "let b0 = window_bin(v0, config.m0_lo, config.m0_stride);",
    );
    // A non-finite sample halts the run for the host to report.
    expect(wgsl).toContain("status = 4u;");
    // Observed range and escape counters, for the calibration loop.
    expect(wgsl).toContain(
      "@group(0) @binding(5) var<storage, read_write> range: array<atomic<u32>>;",
    );
  });

  it("emits the sampling helpers once, after the prelude and before the entry point", () => {
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const { wgsl } = result.shader;

    expect(wgsl).toContain(
      [
        "fn f32_order_key(v: f32) -> u32 {",
        "  let bits = bitcast<u32>(v);",
        "  return select(~bits, bits | 0x80000000u, (bits & 0x80000000u) == 0u);",
        "}",
      ].join("\n"),
    );
    expect(wgsl).toContain(
      [
        "fn window_bin(v: f32, lo: f32, stride: f32) -> i32 {",
        "  let t = (v - lo) / stride;",
        "  if (t < -1.0) { return -1; }",
        "  if (t >= f32(HIST_BINS) + 1.0) { return i32(HIST_BINS); }",
        "  var bin = i32(floor(t));",
        "  if (lo + f32(bin) * stride > v) {",
        "    bin = bin - 1;",
        "  } else if (lo + f32(bin + 1) * stride <= v) {",
        "    bin = bin + 1;",
        "  }",
        "  return clamp(bin, -1, i32(HIST_BINS));",
        "}",
      ].join("\n"),
    );
    // `HIST_BINS` must already be declared where the helpers read it.
    expect(wgsl.indexOf("const HIST_BINS: u32 =")).toBeLessThan(
      wgsl.indexOf("fn window_bin("),
    );
    expect(wgsl.indexOf("fn window_bin(")).toBeLessThan(
      wgsl.indexOf("fn step_runs("),
    );
    expect(wgsl.match(/fn window_bin\(/g)).toHaveLength(1);
  });

  it("samples a place count through the one f32 path, block for block", () => {
    // SIR's Infected is profile index 1, and one metric gets the full 1024
    // bins, so this is the whole per-metric block the design specifies.
    const result = compileFor(sir, {
      metrics: [placeCount("infected", "place__infected")],
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }

    expect(result.shader.wgsl).toContain(
      [
        "    if (in_range && status == 0u) {",
        "      let v0: f32 = f32(counts[1u]);",
        "      if ((bitcast<u32>(v0) & 0x7f800000u) == 0x7f800000u) {",
        "        // NaN or an infinity: the CPU evaluator throws here, so the run halts",
        "        // and the host fails the experiment naming the metric.",
        "        status = 4u;",
        "      } else {",
        "        let k0 = f32_order_key(v0);",
        "        atomicMin(&local_min[0u], k0);",
        "        atomicMax(&local_max[0u], k0);",
        "        let b0 = window_bin(v0, config.m0_lo, config.m0_stride);",
        "        if (b0 < 0) {",
        "          atomicAdd(&range[2u], 1u);",
        "          atomicAdd(&local_hist[0u], 1u);",
        "        } else if (b0 >= i32(HIST_BINS)) {",
        "          atomicAdd(&range[3u], 1u);",
        "          atomicAdd(&local_hist[0u + HIST_BINS - 1u], 1u);",
        "        } else {",
        "          atomicAdd(&local_hist[0u + u32(b0)], 1u);",
        "        }",
        "      }",
        "    }",
      ].join("\n"),
    );
  });

  it("gives the second metric its own status, range slots and histogram rows", () => {
    const result = compileFor(sir, {
      metrics: [
        placeCount("susceptible", "place__susceptible"),
        placeCount("infected", "place__infected"),
      ],
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const { wgsl, histogramBins } = result.shader;

    expect(wgsl).toContain("let v1: f32 = f32(counts[1u]);");
    expect(wgsl).toContain("status = 5u;");
    expect(wgsl).toContain("atomicMin(&local_min[1u], k1);");
    expect(wgsl).toContain(
      "let b1 = window_bin(v1, config.m1_lo, config.m1_stride);",
    );
    expect(wgsl).toContain("atomicAdd(&range[6u], 1u);");
    expect(wgsl).toContain("atomicAdd(&range[7u], 1u);");
    expect(wgsl).toContain(
      `atomicAdd(&local_hist[${histogramBins}u + u32(b1)], 1u);`,
    );
    expect(wgsl).toContain("m1_lo: f32,");
    expect(wgsl).toContain("m1_stride: f32,");
  });
});

describe("state layout offsets", () => {
  /** A typed place with one real attribute, so the layout has token words. */
  const typedNet = (): SDCPN => ({
    ...sir,
    types: [
      {
        id: "type__tank",
        name: "Tank",
        iconSlug: "circle",
        displayColor: "#3366ff",
        elements: [{ elementId: "el__level", name: "level", type: "real" }],
      },
    ],
    places: sir.places.map((place, index) =>
      index === 0 ? { ...place, colorId: "type__tank", capacity: 4 } : place,
    ),
  });

  const statusWriteOffset = (wgsl: string): number =>
    Number(/state\[base \+ (\d+)u\] = status;/.exec(wgsl)![1]);
  const rngWriteOffset = (wgsl: string): number =>
    Number(/state\[base \+ (\d+)u\] = rng_state;/.exec(wgsl)![1]);

  it("matches where the shader writes them, for an uncoloured net", () => {
    const compiled = compileFor(sir);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    expect(compiled.shader.statusOffset).toBe(
      statusWriteOffset(compiled.shader.wgsl),
    );
    expect(compiled.shader.rngOffset).toBe(
      rngWriteOffset(compiled.shader.wgsl),
    );
  });

  it("matches where the shader writes them once token attributes exist", () => {
    const compiled = compileFor(typedNet());
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    const { rngOffset, statusOffset, stateWordsPerRun } = compiled.shader;

    expect(statusOffset).toBe(statusWriteOffset(compiled.shader.wgsl));
    expect(rngOffset).toBe(rngWriteOffset(compiled.shader.wgsl));

    // And the old derivation would have been wrong here, which is the whole
    // point: token words sit after the status word.
    expect(statusOffset).not.toBe(stateWordsPerRun - 1);
    expect(rngOffset).not.toBe(stateWordsPerRun - 2);
  });
});

/**
 * A weight-1 typed input arc means the transition *chooses* a token, and the CPU
 * chooses by walking `indexCombinations(n, 1)` and firing on the first passing
 * candidate. These pin the two halves of that: reading the candidate's attributes,
 * and removing exactly the chosen token afterwards.
 */
describe("typed token consumption", () => {
  const crashNet = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
    transitions: satellites.transitions.filter(
      (transition) => transition.name === "Crash",
    ),
  });

  const crashWgsl = (): string => {
    const compiled = compileFor(crashNet());
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader.wgsl;
  };

  it("reads the candidate token's attributes from its own slot", () => {
    const wgsl = crashWgsl();

    // Same slot arithmetic the dynamics loop uses, indexed by the candidate
    // rather than by a full sweep.
    expect(wgsl).toMatch(
      /bitcast<f32>\(state\[\(base \+ \d+u \+ cand_0 \* \d+u\) \+ 0u\]\)/,
    );
  });

  it("stops at the first passing candidate, as the CPU does", () => {
    const wgsl = crashWgsl();

    expect(wgsl).toMatch(/for \(var cand_0: u32 = 0u; cand_0 < counts\[\d+u\]/);
    expect(wgsl).toMatch(/if \(fires\) \{ sel_0 = cand_0; break; \}/);
  });

  it("draws the acceptance uniform once, outside the candidate scan", () => {
    // `Crash` is a predicate, so it never draws. A *stochastic* typed lambda does,
    // and the CPU draws once per transition per frame and reuses it for every
    // candidate — drawing inside the scan would give a place holding more tokens
    // more chances to fire, so it would fire measurably sooner.
    const net = crashNet();
    const stochastic: SDCPN = {
      ...net,
      transitions: net.transitions.map((transition) => ({
        ...transition,
        lambdaType: "stochastic" as const,
        lambdaCode:
          "export default Lambda((tokens) => 1.0 / (1.0 + tokens.Space[0].velocity))",
      })),
    };

    const compiled = compileFor(stochastic);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    const { wgsl } = compiled.shader;
    const drawIndex = wgsl.indexOf("let u = rng_next_f32(&rng_state);");
    const scanIndex = wgsl.indexOf("for (var cand_0:");

    expect(drawIndex).toBeGreaterThan(-1);
    expect(scanIndex).toBeGreaterThan(drawIndex);
  });

  it("compacts stably from the chosen slot, not by swapping the last token in", () => {
    // `monte-carlo/frame-operations.ts` shifts survivors down and preserves their
    // order. A swap-remove would reorder the array, so later frames would
    // enumerate candidates differently and consume different tokens.
    const wgsl = crashWgsl();

    expect(wgsl).toMatch(/for \(var m: u32 = sel_0 \+ 1u; m < counts\[\d+u\]/);
    expect(wgsl).toMatch(/var write_slot: u32 = sel_0;/);
    expect(wgsl).toMatch(/let dst = base \+ \d+u \+ write_slot \* \d+u;/);
    // No swap-in-from-the-end anywhere.
    expect(wgsl).not.toMatch(
      /counts\[\d+u\] - 1u\) \* \d+u;\s*\n\s*for \(var w/,
    );
  });

  it("declares the chosen slot even when the transition has no lambda", () => {
    // Without a lambda the CPU takes combination 0, so the compaction still runs
    // — and it references `sel_0`, which must therefore exist.
    const net = crashNet();
    const withoutLambda: SDCPN = {
      ...net,
      transitions: net.transitions.map((transition) => ({
        ...transition,
        lambdaCode: "",
      })),
    };

    const compiled = compileFor(withoutLambda);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    expect(compiled.shader.wgsl).toMatch(/var sel_0: u32 = 0u;/);
    expect(compiled.shader.wgsl).toMatch(/var m: u32 = sel_0 \+ 1u/);
  });
});

/**
 * A weight-2 typed arc consumes a *pair*, and the CPU chooses it by walking
 * `indexCombinations(n, 2)` and firing on the first passing one. The shader scans
 * the same order by unranking a flat index — see `pair-selection.ts`.
 */
describe("weight-2 typed token consumption", () => {
  const collisionWgsl = (): string => {
    const net: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
      transitions: satellites.transitions.filter(
        (transition) => transition.name === "Collision",
      ),
    };
    const compiled = compileFor(net);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader.wgsl;
  };

  it("compiles a condition over both tokens of the pair", () => {
    const wgsl = collisionWgsl();

    // `const [a, b] = tokens.Space` binds a to the first leg and b to the second,
    // so both candidate variables must appear in the distance computation.
    expect(wgsl).toMatch(/cand_i \* \d+u/);
    expect(wgsl).toMatch(/cand_j \* \d+u/);
  });

  it("scans pairs by unranking a flat index, in the engine's order", () => {
    const wgsl = collisionWgsl();

    expect(wgsl).toMatch(
      /let pair_total = select\(0u, pair_n \* \(pair_n - 1u\)/,
    );
    expect(wgsl).toMatch(
      /let cand_j = x - \(cand_i \* \(pair_a_u - cand_i\)\)/,
    );
    expect(wgsl).toMatch(/sel_0 = cand_i;/);
    expect(wgsl).toMatch(/sel_1 = cand_j;/);
  });

  it("binds tokens[0] to the lower leg of the pair", () => {
    // `const [a, b] = tokens.Space` must put `a` on cand_i. A symmetric condition
    // like distance(a, b) would hide a swap, so this reads only index 0.
    const net: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
      transitions: satellites.transitions
        .filter((transition) => transition.name === "Collision")
        .map((transition) => ({
          ...transition,
          lambdaType: "predicate" as const,
          lambdaCode:
            "export default Lambda((tokens) => tokens.Space[0].x < 1)",
        })),
    };
    const compiled = compileFor(net);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    expect(compiled.shader.wgsl).toMatch(/cand_i \* \d+u\) \+ 0u\]/);
    expect(compiled.shader.wgsl).not.toMatch(/cand_j \* \d+u\) \+ 0u\]/);
  });

  it("defaults to the pair (0, 1), which is combination zero", () => {
    // With no condition to fail the CPU consumes combination 0. `sel_1` therefore
    // cannot be left at its zero initialiser, which would pair a token with itself.
    expect(collisionWgsl()).toMatch(/sel_1 = 1u;/);
  });

  it("compacts both consumed slots, skipping only the higher one", () => {
    const wgsl = collisionWgsl();

    expect(wgsl).toMatch(/if \(m == sel_1\) \{ continue; \}/);
    // The sweep already starts past sel_0, so re-testing it would be dead code.
    expect(wgsl).not.toMatch(/m == sel_0 \|\|/);
    expect(wgsl).toMatch(/counts\[0u\] = counts\[0u\] - 2u;/);
  });
});

/**
 * A transition kernel writes the attributes of the tokens a firing produces. The
 * ordering is the subtle part: a kernel reads the tokens the firing *consumes*,
 * and compaction overwrites those slots.
 */
describe("transition kernels", () => {
  const crashNet = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
    transitions: satellites.transitions.filter(
      (transition) => transition.name === "Crash",
    ),
  });

  const crashWgsl = (): string => {
    const compiled = compileFor(crashNet());
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader.wgsl;
  };

  it("reads the consumed token before compaction overwrites its slot", () => {
    // The emitter hoists only the subexpressions it names, so `x: tokens.Space[0].x`
    // would otherwise stay inline in the write and execute after compaction had
    // moved a survivor into that slot — silently the wrong token's attributes.
    const wgsl = crashWgsl();
    const hoistIndex = wgsl.indexOf("let kout_0: u32 =");
    const compactIndex = wgsl.indexOf("var write_slot: u32 = sel_0;");
    const writeIndex = wgsl.indexOf("state[out + 0u] = kout_0;");

    expect(hoistIndex).toBeGreaterThan(-1);
    expect(compactIndex).toBeGreaterThan(hoistIndex);
    expect(writeIndex).toBeGreaterThan(compactIndex);
  });

  it("writes produced tokens above the live count, so nothing consumes them this frame", () => {
    // Mirrors the CPU, which defers additions to after its transition loop while
    // tracking the count in `pendingOutputCounts`.
    expect(crashWgsl()).toMatch(
      /let out = base \+ \d+u \+ \(counts\[\d+u\] \+ u32\(max\(0, pending\[\d+u\]\)\)/,
    );
  });

  it("compacts this frame's produced tokens down with the survivors", () => {
    // LaunchSatellite writes into Space above the live count; a Crash later in
    // the same frame consumes from Space and shifts everything above the chosen
    // slot down. Stopping the sweep at the live count would leave the new
    // tokens in place, so the end-of-frame fold would count stale slots as
    // live and strand the launched satellite past the end.
    const net: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
      transitions: ["LaunchSatellite", "Crash"].map(
        (name) =>
          satellites.transitions.find(
            (transition) => transition.name === name,
          )!,
      ),
    };
    const compiled = compileFor(net);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    expect(compiled.shader.wgsl).toMatch(
      /for \(var m: u32 = sel_0 \+ 1u; m < counts\[(\d+)u\] \+ u32\(max\(0, pending\[\1u\]\)\); m = m \+ 1u\)/,
    );
  });

  it("refuses a typed output whose kernel has no HIR rather than zeroing it", () => {
    // Writing nothing would leave every attribute at zero and report that as a
    // result, which is the failure mode this replaced.
    const eligibility = assessGpuEligibility(crashNet());
    if (!eligibility.eligible) {
      throw new Error("fixture should be eligible");
    }
    const lowered = hirFromArtifacts(
      crashNet(),
      compileHirArtifacts(crashNet(), undefined, { includeHir: true })
        .artifacts,
    );
    const compiled = compileNetShader({
      sdcpn: crashNet(),
      profile: eligibility.profile,
      parameterValues: resolveNetParameterValues(
        crashNet().parameters,
        {},
        true,
      ),
      lambdaHir: lowered.lambdas,
      dynamicsHir: lowered.dynamics,
      // Deliberately omitted.
      kernelHir: new Map(),
      dt: 0.1,
      framesPerDispatch: 8,
      metrics: [],
      odeMethod: "rk4",
    });

    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.reason).toMatch(/carried no HIR/);
  });
});

/**
 * Same-scope `let`/`var` redeclarations, which is what naga reports and what a
 * text assertion cannot see. Shadowing an outer scope is legal WGSL, so only the
 * innermost scope is checked.
 *
 * Calibrated against a real validator: on the emitter as it stood before the
 * per-stage identifier scope, this reported exactly the twelve findings naga did
 * for RK4 (`u_0_mu`, `u_1_r`, `u_2_ax`, `u_3_ay`, three times over), and none of
 * the `structurally_enabled` or `kout_N` repeats, which live in sibling blocks.
 */
function sameScopeRedeclarations(wgsl: string): string[] {
  const found: string[] = [];
  const stack: Set<string>[] = [new Set()];
  for (const [index, line] of wgsl.split("\n").entries()) {
    const declaration = /(?:^|\s)(?:let|var)\s+(\w+)/u.exec(line);
    if (declaration) {
      const scope = stack.at(-1)!;
      const name = declaration[1]!;
      if (scope.has(name)) {
        found.push(`line ${index + 1}: redeclaration of '${name}'`);
      }
      scope.add(name);
    }
    for (const character of line) {
      if (character === "{") {
        stack.push(new Set());
      } else if (character === "}" && stack.length > 1) {
        stack.pop();
      }
    }
  }
  return found;
}

/** Open braces minus close braces; anything but zero fails at `createShaderModule`. */
function unbalancedBraces(wgsl: string): number {
  let depth = 0;
  for (const character of wgsl) {
    if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
    }
  }
  return depth;
}

/**
 * Expression metrics are emitted from their HIR at the top of the frame,
 * inside the same `if (in_range && status == 0u)` block a place count is
 * sampled in. These pin the emitted text for the shapes the bundled examples
 * use: count arithmetic with a conditional, a `tokens.reduce` loop, and a
 * swept parameter.
 */
describe("expression metrics", () => {
  const cappedSatellites = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
  });

  it("emits SIR's Infected Fraction as hoisted counts and a select", () => {
    // Susceptible, Infected, Recovered are profile indices 0, 1, 2; the
    // metric's `const` bindings hoist under the `m0_` scope in order, and
    // the `if (total === 0) return 0` becomes a `select` over both arms.
    const result = compileFor(sir, {
      metrics: [modelMetric(sir, "metric__infected_fraction")],
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain(
      [
        "    if (in_range && status == 0u) {",
        "      let m0_u_0_s: f32 = f32(counts[0u]);",
        "      let m0_u_1_i: f32 = f32(counts[1u]);",
        "      let m0_u_2_r: f32 = f32(counts[2u]);",
        "      let m0_u_3_total: f32 = ((m0_u_0_s + m0_u_1_i) + m0_u_2_r);",
        "      let v0: f32 = select((m0_u_1_i / m0_u_3_total), 0.0, (m0_u_3_total == 0.0));",
        "      if ((bitcast<u32>(v0) & 0x7f800000u) == 0x7f800000u) {",
      ].join("\n"),
    );
    expect(result.shader.metricIds).toStrictEqual([
      "metric__infected_fraction",
    ]);
  });

  it("emits a `tokens.reduce` metric as a loop over the place's live slots", () => {
    // Satellites' "Average orbital speed": `const sats = ...tokens` binds the
    // span and hoists nothing, the reduce loops to the live count, and the
    // token read is the slot arithmetic the dynamics loop uses. The Satellite
    // colour has four real attributes, `velocity` last.
    const spaceIndex = satellites.places.findIndex(
      (place) => place.name === "Space",
    );
    const result = compileFor(cappedSatellites(), {
      metrics: [modelMetric(satellites, "metric__average_orbital_speed")],
    });
    if (!result.ok) throw new Error(result.reason);
    const { wgsl, placeTokenOffsets, placeTokenStrides } = result.shader;
    const tokenBase = placeTokenOffsets[spaceIndex];
    const stride = placeTokenStrides[spaceIndex];

    expect(spaceIndex).toBe(0);
    expect(stride).toBe(4);
    expect(wgsl).toContain(
      [
        "    if (in_range && status == 0u) {",
        "      var m0_u_0_sum: f32 = 0.0;",
        "      for (var m0_u_1_s: u32 = 0u; m0_u_1_s < counts[0u]; m0_u_1_s = m0_u_1_s + 1u) {",
        `        m0_u_0_sum = (m0_u_0_sum + bitcast<f32>(state[(base + ${tokenBase}u + m0_u_1_s * ${stride}u) + 3u]));`,
        "      }",
        "      let v0: f32 = select((m0_u_0_sum / f32(counts[0u])), 0.0, (f32(counts[0u]) == 0.0));",
      ].join("\n"),
    );
  });

  it("reads a swept parameter from its per-run local inside a metric", () => {
    // Vaccination's "Total cost" reads `parameters.vaccination_coverage`; swept,
    // it resolves to `run_param_0` exactly as it does inside a lambda, while
    // the fixed parameters stay literals.
    const result = compileFor(vaccination, {
      metrics: [modelMetric(vaccination, "metric__total_cost")],
      runParameters: ["vaccination_coverage"],
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain(
      "      let m0_u_2_coverage: f32 = run_param_0;",
    );
    expect(result.shader.wgsl).toMatch(
      /      let m0_u_3_reduction: f32 = -?\d+(\.\d+)?(e[-+]?\d+)?;/,
    );
  });

  it("gives an expression metric the full bin budget, whatever the places' ceilings", () => {
    // A count metric on Airborne (capacity 16) sizes to 17 bins; an
    // expression over the same place has no ceiling the shader can know.
    const drone = dronePatrol.petriNetDefinition;
    const result = compileFor(drone, {
      metrics: [
        loweredMetric("airborne_share", "return state.places.Airborne.count;"),
      ],
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.histogramBins).toBe(GPU_HISTOGRAM_MAX_BINS);
  });

  it("reports a reason rather than throwing when a metric names an unknown place", () => {
    const result = compileFor(sir, {
      metrics: [loweredMetric("nowhere", "return state.places.Nowhere.count;")],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/unknown field `Nowhere`/);
  });

  it("scopes each metric's temporaries so two metrics may bind the same name", () => {
    // Both bodies bind `total`; without the per-metric scope the second
    // metric's `let` would redeclare the first's in the frame loop's scope.
    const result = compileFor(sir, {
      metrics: [
        modelMetric(sir, "metric__infected_fraction"),
        loweredMetric(
          "alive",
          "const total = state.places.Susceptible.count + state.places.Infected.count;\nreturn total;",
        ),
      ],
    });
    if (!result.ok) throw new Error(result.reason);
    const { wgsl } = result.shader;

    expect(wgsl).toContain("let m0_u_3_total: f32 =");
    expect(wgsl).toContain("let m1_u_0_total: f32 =");
    expect(wgsl).toContain("let v1: f32 = m1_u_0_total;");
    expect(sameScopeRedeclarations(wgsl)).toStrictEqual([]);
    expect(unbalancedBraces(wgsl)).toBe(0);
  });

  it("scans clean with every satellites model metric, two of them reduce loops", () => {
    const net = cappedSatellites();
    const result = compileFor(net, {
      metrics: (satellites.metrics ?? []).map((metric) =>
        modelMetric(satellites, metric.id),
      ),
    });
    if (!result.ok) throw new Error(result.reason);
    const { wgsl, metricIds } = result.shader;

    expect(metricIds).toHaveLength(4);
    // Both reduce metrics loop to the live count under their own scope.
    expect(wgsl).toContain(
      "for (var m2_u_1_s: u32 = 0u; m2_u_1_s < counts[0u];",
    );
    expect(wgsl).toContain(
      "for (var m3_u_1_s: u32 = 0u; m3_u_1_s < counts[0u];",
    );
    expect(sameScopeRedeclarations(wgsl)).toStrictEqual([]);
    expect(unbalancedBraces(wgsl)).toBe(0);
  });
});

describe("generated WGSL validity", () => {
  const cappedSatellites = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
  });

  // Every RK stage re-emits the same derivative HIR, and each emitter counts its
  // hoisted temporaries from zero. All of those statements land in one scope, so
  // the stage name has to reach the identifiers — the shader is otherwise
  // well-formed text that fails at `createShaderModule` with nothing upstream
  // noticing. `euler` has one stage and so never collided.
  it.each(["euler", "rk2", "rk4"] as const)(
    "declares each hoisted temporary once per scope with %s",
    (odeMethod) => {
      const compiled = compileFor(cappedSatellites(), { odeMethod });
      if (!compiled.ok) {
        throw new Error(compiled.reason);
      }

      expect(sameScopeRedeclarations(compiled.shader.wgsl)).toStrictEqual([]);
    },
  );

  it.each(["euler", "rk2", "rk4"] as const)(
    "scans clean with a metric sampled at the top of the frame, with %s",
    (odeMethod) => {
      // The sampling block now precedes the dynamics and transition blocks in
      // the same iteration, so its `let`/`var` declarations share the frame
      // loop's scope tree with theirs.
      const space = satellites.places.find((place) => place.name === "Space");
      if (space === undefined) {
        throw new Error("the satellites example has no Space place");
      }
      const compiled = compileFor(cappedSatellites(), {
        odeMethod,
        metrics: [placeCount("in_orbit", space.id)],
      });
      if (!compiled.ok) {
        throw new Error(compiled.reason);
      }

      expect(sameScopeRedeclarations(compiled.shader.wgsl)).toStrictEqual([]);
      expect(unbalancedBraces(compiled.shader.wgsl)).toBe(0);
    },
  );

  it("keeps every stage's derivatives distinct rather than merging them", () => {
    // A scope prefix would also silence the redeclaration by making all four
    // stages write one name, which would compile and integrate the wrong
    // trajectory. Each stage must still contribute its own value.
    const compiled = compileFor(cappedSatellites(), { odeMethod: "rk4" });
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    for (const stage of ["k1", "k2", "k3", "k4"]) {
      expect(compiled.shader.wgsl).toContain(`let ${stage}_u_0_mu: f32`);
    }
  });
});

/**
 * The host reads a compact per-run summary instead of the run state. Run state is
 * dominated by the token array, which the host never decodes, and copying it into
 * a mappable buffer needs host-visible memory equal to the state — measured, that
 * capped a 3112-byte-per-run net at ~689k runs on hardware reporting a 4 GiB
 * `maxBufferSize`, and the failure surfaced three operations later as
 * "[Invalid Buffer] is invalid due to a previous error" from `mapAsync`.
 *
 * These offsets are an ABI between the generated WGSL and the host decoder, and
 * nothing else checks that the two agree.
 */
describe("run summary ABI", () => {
  const summaryFor = (sdcpn: SDCPN) => {
    const compiled = compileFor(sdcpn);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader;
  };

  it("writes one word per place plus the status", () => {
    const shader = summaryFor(sir);

    expect(shader.summaryWordsPerRun).toBe(shader.placeCountOffsets.length + 1);
    // Far smaller than the state it replaces, which is the entire point.
    expect(shader.summaryWordsPerRun).toBeLessThan(shader.stateWordsPerRun);
  });

  it("writes each place count at the index the host reads it from", () => {
    // The host indexes counts by place order, not by their offsets in run state.
    const shader = summaryFor(sir);

    for (let placeIndex = 0; placeIndex < 3; placeIndex++) {
      expect(shader.wgsl).toContain(
        `summary[summary_base + ${placeIndex}u] = counts[${placeIndex}u];`,
      );
    }
  });

  it("writes the status at the offset the type advertises", () => {
    // `summaryStatusOffset` is what the host adds to a run's base. If the shader
    // wrote it anywhere else the host would decode a place count as a status and
    // silently report every run as still running.
    const shader = summaryFor(sir);

    expect(shader.wgsl).toContain(
      `summary[summary_base + ${shader.summaryStatusOffset}u] = status;`,
    );
    expect(shader.summaryStatusOffset).toBe(shader.placeCountOffsets.length);
  });

  it("strides the summary by its own width, not the run state's", () => {
    const shader = summaryFor(sir);

    expect(shader.wgsl).toContain(
      `let summary_base = run_index * ${shader.summaryWordsPerRun}u;`,
    );
  });

  it("keeps the summary tiny on a typed net, where state is large", () => {
    // The satellites net at capacity 16 is 552 bytes of state per run; its
    // summary is 4 words. That ratio is what moves the run ceiling.
    const capped: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
    };
    const shader = summaryFor(capped);

    expect(shader.summaryWordsPerRun * 20).toBeLessThan(
      shader.stateWordsPerRun,
    );
  });
});
