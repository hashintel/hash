/**
 * Compiles a whole net into one WGSL compute shader.
 *
 * The unit of work is an *experiment*, not a frame. One invocation owns one run
 * and advances it through many frames inside the shader, so per-run state stays
 * in registers and the host is not involved until a chunk finishes. This is the
 * only shape that pays: "The WebGPU backend" in
 * `libs/@local/petrinaut-arch-docs/content/simulation/performance.mdx`
 * measures a per-frame host round-trip at hundreds of microseconds against ~1 µs of
 * per-frame work, so any design that reads back each frame is slower than doing
 * nothing. That is also why this deliberately does **not** implement
 * `MonteCarloSimulator`, whose synchronous per-frame `advanceAll()` would force
 * exactly that round-trip.
 *
 * The concerns live in `compile-net-shader/`: `token-layout` (state and
 * attribute encoding), `transition-firing` (enabledness, token choice,
 * consumption), `output-emission` (kernel outputs), `dynamics` (ODE stages),
 * `histograms` (on-device metrics) and `run-parameters` (per-run buffer).
 */
import { getArcEndpointPlaceId } from "../arc-endpoints";
import { emitDynamics } from "./compile-net-shader/dynamics";
import {
  emitFrameHistograms,
  histogramBinCount,
  histogramWindowUniformLines,
  observedRangeBindingLines,
  sampledCountCeiling,
  workgroupHistogramLines,
} from "./compile-net-shader/histograms";
import {
  emitKernelValues,
  emitOutputWrites,
} from "./compile-net-shader/output-emission";
import {
  planRunParameters,
  runParameterBindingLines,
  runParameterLoadLines,
  runParameterLocalLines,
} from "./compile-net-shader/run-parameters";
import {
  discreteTypesByPlaceId,
  planStateLayout,
} from "./compile-net-shader/token-layout";
import {
  emitConsumption,
  emitFiringChoice,
  planTransitionFiring,
  resolveArcPlaces,
} from "./compile-net-shader/transition-firing";
import { WgslBailError, emitF32Literal } from "./emit-wgsl";
import { commentSafe } from "./wgsl-identifiers";
import { wgslPrelude } from "./wgsl-prelude";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";
import type { GpuOdeMethod } from "./compile-net-shader/dynamics";
import type { GpuMetricSpec } from "./compile-net-shader/histograms";
import type { GpuNetProfile } from "./eligibility";

export {
  GPU_BASELINE_WORKGROUP_STORAGE_BYTES,
  GPU_HISTOGRAM_MAX_BINS,
  histogramBinCount,
} from "./compile-net-shader/histograms";
export { encodeInitialTokenWords } from "./compile-net-shader/token-layout";
export type { GpuMetricSpec, GpuOdeMethod };

/** Invocations per workgroup. 256 is the guaranteed WebGPU maximum. */
export const GPU_WORKGROUP_SIZE = 256;

export type CompileNetShaderInput = {
  sdcpn: SDCPN;
  profile: GpuNetProfile;
  /** Resolved net parameter values, inlined into the shader as literals. */
  parameterValues: Readonly<Record<string, number | boolean>>;
  /**
   * Parameters whose value varies per run (a sweep over a range). Instead of
   * a literal, their reads come from a per-run f32 buffer the host fills with
   * each run's draw; each must name a numeric parameter in `parameterValues`
   * (whose value then only seeds scenario compilation, not the shader).
   */
  runParameters?: readonly string[];
  /** Lowered HIR per transition id, when the transition has a lambda. */
  lambdaHir: ReadonlyMap<string, HirFunction>;
  /** Lowered HIR per place id, for places with dynamics. */
  dynamicsHir: ReadonlyMap<string, HirFunction>;
  /**
   * Lowered HIR per transition id, for transitions with a compiled kernel.
   *
   * Omitted leaves output tokens unwritten, which is only correct for a net whose
   * output places are all uncoloured — a typed place would receive tokens with
   * every attribute at zero.
   */
  kernelHir?: ReadonlyMap<string, HirFunction>;
  dt: number;
  /** Frames advanced per dispatch. Bounded to keep the GPU watchdog happy. */
  framesPerDispatch: number;
  metrics: readonly GpuMetricSpec[];
  odeMethod: GpuOdeMethod;
  /**
   * Extension settings, so input slot names come from `buildLambdaContext` —
   * the same source the HIR was type-checked against. Re-deriving them here
   * would risk drifting from its component-port scoping and its
   * last-arc-with-a-name-wins rule.
   */
  extensions?: PetrinautExtensionSettings;
};

export type CompiledNetShader = {
  wgsl: string;
  /** u32 words of state per run. */
  stateWordsPerRun: number;
  /**
   * u32 words of *result* per run: the place counts, the status, then each
   * derived-capacity place's per-run maximum count.
   *
   * The host reads this back instead of the run state. Run state is dominated by
   * the token array, which the host never decodes, and copying it into a mappable
   * buffer needs host-visible memory equal to the state itself: measured, that
   * capped a 3112-byte-per-run net at ~689k runs on hardware whose
   * `maxBufferSize` reports 4 GiB. A few words per run moves that ceiling out by
   * more than two orders of magnitude.
   */
  summaryWordsPerRun: number;
  /** Word offset of each place's token count within a run's state. */
  placeCountOffsets: number[];
  /** Word offset of each place's token slots; equal to the next place's for an uncoloured place. */
  placeTokenOffsets: number[];
  /** Words per token slot, per place; 0 for an uncoloured place. */
  placeTokenStrides: number[];
  /** Word offset of the status within a run's *summary*. */
  summaryStatusOffset: number;
  /**
   * Word offset of the run's RNG state and status.
   *
   * Exposed rather than derived by the host: the layout is
   * `counts | firings | rng | status | tokens`, so counting back from
   * `stateWordsPerRun` only finds them when a net has no token attributes at all.
   */
  rngOffset: number;
  statusOffset: number;
  /**
   * Profile indices of derived-capacity places, in summary order: each
   * appends its per-run maximum count after the status word.
   */
  derivedCapacityPlaceIndices: number[];
  /** Metric ids in histogram order. */
  metricIds: string[];
  /**
   * Histogram bins per metric per frame, from `histogramBinCount`. Baked into
   * the WGSL, so the host must decode with exactly this value.
   */
  histogramBins: number;
  /**
   * Per-run parameters in buffer order; empty when every parameter is a
   * baked literal. Non-empty obliges the runner to bind a run-major f32
   * buffer of `runCount × runParameterIds.length` draws at binding 4.
   */
  runParameterIds: readonly string[];
  /** Which transitions got a compiled lambda; the rest are always-enabled. */
  compiledLambdas: string[];
};

export type CompileNetShaderResult =
  | { ok: true; shader: CompiledNetShader }
  | { ok: false; reason: string };

/**
 * Generates the shader, or explains why it cannot be generated.
 */
export function compileNetShader(
  input: CompileNetShaderInput,
): CompileNetShaderResult {
  const {
    sdcpn,
    profile,
    parameterValues,
    lambdaHir,
    dynamicsHir,
    dt,
    framesPerDispatch,
    metrics,
    odeMethod,
    extensions,
    kernelHir = new Map<string, HirFunction>(),
    runParameters = [],
  } = input;

  try {
    const runParameterPlan = planRunParameters(runParameters, parameterValues);
    const emitterParameterValues = runParameterPlan.emitterParameterValues;
    const discreteTypes = discreteTypesByPlaceId(sdcpn);
    const placeIndexById = new Map(
      profile.places.map((place, index) => [place.id, index]),
    );
    const histogramBins = histogramBinCount(
      metrics.length,
      sampledCountCeiling(metrics, profile, placeIndexById),
    );
    const layout = planStateLayout(profile, sdcpn.transitions.length);
    const placeCount = profile.places.length;
    const transitionCount = sdcpn.transitions.length;

    const lines: string[] = [];
    const push = (line: string) => lines.push(line);

    push(`// Generated by compile-net-shader.ts — do not edit.`);
    push(
      `// One invocation per run; up to ${framesPerDispatch} frames per dispatch.`,
    );
    push(`const STATE_WORDS: u32 = ${layout.stateWordsPerRun}u;`);
    push(`const HIST_BINS: u32 = ${histogramBins}u;`);
    push(`const DT: f32 = ${emitF32Literal(dt)};`);
    push("");
    push(`struct Config {`);
    push(`  run_count: u32,`);
    push(`  base_frame: u32,`);
    push(`  frame_limit: u32,`);
    push(`  seed: u32,`);
    // Frames THIS dispatch advances. Bounded by framesPerDispatch, but the
    // host ramps early dispatches short so first frames stream in
    // milliseconds; a compile-time bound would step past the ramp.
    push(`  chunk_frames: u32,`);
    for (const line of histogramWindowUniformLines(metrics.length)) {
      push(line);
    }
    push(`};`);
    push(`@group(0) @binding(0) var<storage, read_write> state: array<u32>;`);
    push(
      `@group(0) @binding(1) var<storage, read_write> hist: array<atomic<u32>>;`,
    );
    push(`@group(0) @binding(2) var<uniform> config: Config;`);
    // Compact per-run results, gathered on the device so the host never reads
    // the token array back; the mappable buffer a readback needs is the
    // scarcest memory in the system.
    push(`@group(0) @binding(3) var<storage, read_write> summary: array<u32>;`);
    for (const line of runParameterBindingLines(runParameterPlan)) {
      push(line);
    }
    for (const line of observedRangeBindingLines(metrics.length)) {
      push(line);
    }
    push("");
    push(wgslPrelude());
    push("");
    for (const line of workgroupHistogramLines(metrics.length, histogramBins)) {
      push(line);
    }

    push(`@compute @workgroup_size(${GPU_WORKGROUP_SIZE})`);
    push(`fn step_runs(@builtin(global_invocation_id) gid: vec3<u32>,`);
    push(`             @builtin(local_invocation_index) lid: u32) {`);
    push(`  let run_index = gid.x;`);
    push(`  let in_range = run_index < config.run_count;`);
    push(`  let base = run_index * STATE_WORDS;`);
    push("");

    // Load state into registers. Out-of-range invocations still execute so they
    // reach the workgroup barriers the histogram flush needs.
    push(`  var counts: array<u32, ${Math.max(placeCount, 1)}>;`);
    push(`  var firings: array<u32, ${Math.max(transitionCount, 1)}>;`);
    push(`  var rng_state: u32 = 0u;`);
    push(`  var status: u32 = 0u;`);
    for (const [slot] of layout.derivedPlaceIndices.entries()) {
      push(`  var max_count_${slot}: u32 = 0u;`);
    }
    for (const line of runParameterLocalLines(runParameterPlan)) {
      push(line);
    }
    push(`  if (in_range) {`);
    for (let index = 0; index < placeCount; index++) {
      push(
        `    counts[${index}u] = state[base + ${layout.countsOffset + index}u];`,
      );
    }
    for (let index = 0; index < transitionCount; index++) {
      push(
        `    firings[${index}u] = state[base + ${layout.firingsOffset + index}u];`,
      );
    }
    push(`    rng_state = state[base + ${layout.rngOffset}u];`);
    push(`    status = state[base + ${layout.statusOffset}u];`);
    for (const [slot] of layout.derivedPlaceIndices.entries()) {
      push(
        `    max_count_${slot} = state[base + ${layout.maxesOffset + slot}u];`,
      );
    }
    for (const line of runParameterLoadLines(runParameterPlan)) {
      push(line);
    }
    push(`  }`);
    push("");

    push(
      `  for (var frame: u32 = 0u; frame < config.chunk_frames; frame = frame + 1u) {`,
    );
    push(`    let absolute_frame = config.base_frame + frame;`);
    push(
      `    let running = in_range && status == 0u && absolute_frame < config.frame_limit;`,
    );
    push("");

    emitDynamics(push, {
      places: profile.places,
      dynamicsHir,
      layout,
      parameterValues: emitterParameterValues,
      odeMethod,
    });

    // Removals apply immediately so later transitions see them, matching the
    // CPU engine; additions are held until the end of the frame, so capacity
    // checks fold in what earlier transitions already produced this frame.
    push(`    var pending: array<i32, ${Math.max(placeCount, 1)}>;`);
    for (let index = 0; index < placeCount; index++) {
      push(`    pending[${index}u] = 0;`);
    }
    push(`    var any_fired = false;`);
    push(`    var any_enabled = false;`);
    push("");

    const compiledLambdas: string[] = [];

    for (const [transitionIndex, transition] of sdcpn.transitions.entries()) {
      const inputs = resolveArcPlaces(
        transition.inputArcs,
        getArcEndpointPlaceId,
        placeIndexById,
      );
      const outputs = resolveArcPlaces(
        transition.outputArcs,
        getArcEndpointPlaceId,
        placeIndexById,
      );
      const firing = planTransitionFiring({
        transition,
        inputs,
        sdcpn,
        profile,
        layout,
        placeIndexById,
        discreteTypesByPlaceId: discreteTypes,
        extensions,
      });

      push(`    // transition: ${commentSafe(transition.name)}`);
      push(`    {`);
      push(
        `      let structurally_enabled = running && (${firing.enabledCondition});`,
      );
      push(`      any_enabled = any_enabled || structurally_enabled;`);

      const choice = emitFiringChoice(
        push,
        firing,
        lambdaHir.get(transition.id),
        emitterParameterValues,
      );
      if (choice.compiledLambda) {
        compiledLambdas.push(transition.id);
      }

      push(`      if (${choice.fireCondition}) {`);
      const kernelWrites = emitKernelValues(push, {
        transition,
        outputs,
        kernel: kernelHir.get(transition.id),
        sdcpn,
        profile,
        discreteTypesByPlaceId: discreteTypes,
        selectionTokenSlots: firing.selectionTokenSlots,
        parameterValues: emitterParameterValues,
        extensions,
      });
      emitConsumption(push, firing, layout, profile);
      emitOutputWrites(push, { outputs, kernelWrites, layout, profile });
      push(
        `        firings[${transitionIndex}u] = firings[${transitionIndex}u] + 1u;`,
      );
      push(`        any_fired = true;`);
      push(`      }`);
      push(`    }`);
    }

    push("");
    push(`    if (running) {`);
    for (let index = 0; index < placeCount; index++) {
      push(
        `      counts[${index}u] = u32(max(0, i32(counts[${index}u]) + pending[${index}u]));`,
      );
    }
    // A run with nothing enabled and nothing fired is deadlocked; one that
    // reaches the frame limit is complete. Both stop consuming work.
    push(`      if (!any_fired && !any_enabled) { status = 1u; }`);
    push(
      `      if (absolute_frame + 1u >= config.frame_limit) { status = 2u; }`,
    );
    // Derived capacities detect overflow instead of blocking: the highest slot
    // a frame writes is its post-fold count minus one, so a post-fold count
    // past the slab means this frame wrote out of bounds (harmlessly — robust
    // buffer access clamps, and any overflow discards the attempt). Status 3
    // halts the run and tells the host to grow the slab and re-run.
    for (const [slot, placeIndex] of layout.derivedPlaceIndices.entries()) {
      const place = profile.places[placeIndex]!;
      push(
        `      max_count_${slot} = max(max_count_${slot}, counts[${placeIndex}u]);`,
      );
      push(
        `      if (counts[${placeIndex}u] > ${place.capacity}u) { status = 3u; }`,
      );
    }
    push(`    }`);
    push("");

    emitFrameHistograms(push, {
      metrics,
      placeIndexById,
      bins: histogramBins,
      workgroupSize: GPU_WORKGROUP_SIZE,
    });

    push(`  }`);
    push("");

    // Store state back for the next chunk.
    push(`  if (in_range) {`);
    for (let index = 0; index < placeCount; index++) {
      push(
        `    state[base + ${layout.countsOffset + index}u] = counts[${index}u];`,
      );
    }
    for (let index = 0; index < transitionCount; index++) {
      push(
        `    state[base + ${layout.firingsOffset + index}u] = firings[${index}u];`,
      );
    }
    push(`    state[base + ${layout.rngOffset}u] = rng_state;`);
    push(`    state[base + ${layout.statusOffset}u] = status;`);
    for (const [slot] of layout.derivedPlaceIndices.entries()) {
      push(
        `    state[base + ${layout.maxesOffset + slot}u] = max_count_${slot};`,
      );
    }
    push("");

    // The compact result the host reads back, written from the same registers
    // every dispatch and overwritten by the next, so after the final dispatch
    // it holds the final state.
    push(`    let summary_base = run_index * ${layout.summaryWordsPerRun}u;`);
    for (let index = 0; index < placeCount; index++) {
      push(`    summary[summary_base + ${index}u] = counts[${index}u];`);
    }
    push(`    summary[summary_base + ${placeCount}u] = status;`);
    for (const [slot] of layout.derivedPlaceIndices.entries()) {
      push(
        `    summary[summary_base + ${placeCount + 1 + slot}u] = max_count_${slot};`,
      );
    }
    push(`  }`);
    push(`}`);

    return {
      ok: true,
      shader: {
        wgsl: lines.join("\n"),
        stateWordsPerRun: layout.stateWordsPerRun,
        summaryWordsPerRun: layout.summaryWordsPerRun,
        placeCountOffsets: profile.places.map(
          (_, index) => layout.countsOffset + index,
        ),
        placeTokenOffsets: [...layout.placeTokenOffsets],
        placeTokenStrides: [...layout.placeTokenStrides],
        summaryStatusOffset: placeCount,
        rngOffset: layout.rngOffset,
        statusOffset: layout.statusOffset,
        derivedCapacityPlaceIndices: [...layout.derivedPlaceIndices],
        metricIds: metrics.map((metric) => metric.id),
        histogramBins,
        runParameterIds: [...runParameterPlan.ids],
        compiledLambdas,
      },
    };
  } catch (error) {
    if (error instanceof WgslBailError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}
