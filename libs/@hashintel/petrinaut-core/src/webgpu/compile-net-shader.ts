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
 * Metrics are reduced on the GPU into per-frame histograms, because shipping raw
 * per-run samples back would be gigabytes for a large experiment
 * (600 frames × 1M runs × 4 B ≈ 2.4 GB) while a histogram is under a megabyte.
 */
import { getArcEndpointPlaceId } from "../arc-endpoints";
import { buildKernelContext, buildLambdaContext } from "../hir/surface-context";
import {
  computeTransitionCapacityConstraints,
  PLACE_CAPACITY_UNBOUNDED,
} from "../simulation/engine/capacity";
import { WgslBailError, WgslEmitter, emitF32Literal } from "./emit-wgsl";
import { emitPairScanWgsl } from "./pair-selection";
import { wgslPrelude } from "./wgsl-prelude";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirExpr, HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";
import type { GpuNetProfile } from "./eligibility";
import type { WgslParameterValue, WgslValue } from "./emit-wgsl";

/** Invocations per workgroup. 256 is the guaranteed WebGPU maximum. */
export const GPU_WORKGROUP_SIZE = 256;

/** Most bins any shader allocates, however generous the budget. */
export const GPU_HISTOGRAM_MAX_BINS = 1024;

/**
 * `maxComputeWorkgroupStorageSize` every conformant WebGPU device supports.
 *
 * The per-workgroup histogram (`local_hist`) lives in workgroup storage, so
 * this budget is what bounds the bin count. `requestGpuDevice` asks only for
 * larger *buffer* limits, which leaves the created device at exactly this
 * default — so sizing against the baseline is sizing against the actual
 * device, and the shader stays device-independent and deterministic.
 */
export const GPU_BASELINE_WORKGROUP_STORAGE_BYTES = 16384;

/**
 * Histogram bins per metric per frame, for one compiled shader.
 *
 * One bin per integer token count, so the bin count is the largest count the
 * charts can distinguish plus one saturating top bin. Two inputs size it:
 *
 * - The workgroup-storage budget: `local_hist` holds `bins × metricCount`
 *   u32 atomics, so more metrics mean fewer bins. Up to four metrics get the
 *   full `GPU_HISTOGRAM_MAX_BINS`; a fixed 256 both wasted the budget below
 *   five metrics and exceeded it (failing pipeline creation) above sixteen.
 * - The sampled places' count ceiling, when every sampled place has one
 *   (a typed place's slot capacity, or a declared capacity the shader
 *   enforces): counts past the ceiling cannot occur, so bins past it would
 *   only slow the per-frame zero/merge loops.
 */
export function histogramBinCount(
  metricCount: number,
  sampledCountCeiling: number | null,
): number {
  const budget = Math.floor(
    GPU_BASELINE_WORKGROUP_STORAGE_BYTES / (4 * Math.max(1, metricCount)),
  );
  const bins = Math.max(2, Math.min(GPU_HISTOGRAM_MAX_BINS, budget));
  if (sampledCountCeiling === null) {
    return bins;
  }
  return Math.max(2, Math.min(bins, sampledCountCeiling + 1));
}

export type GpuOdeMethod = "euler" | "rk2" | "rk4";

export type GpuMetricSpec = {
  id: string;
  /** Place whose token count is sampled. */
  placeId: string;
};

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
   * u32 words of *result* per run — the place counts and the status.
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
   * A typed net seeded a token attribute and read its status out of the token
   * array, which left every run sharing one RNG stream.
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
 * Per-token attribute accessor: field name to a WGSL value reading that field of
 * one candidate token.
 */
type TokenReader = (fieldName: string) => WgslValue;

/**
 * Builds a reader for one token slot of a place.
 *
 * A token's words are its `real` attributes as f32, then its `integer`/`boolean`
 * attributes as u32, matching `eligibility.ts`'s `wordsPerToken`. `slotExpr` is
 * WGSL for the token's first word, so the caller decides which token — a loop
 * variable, or one leg of a pair scan.
 */
function makeTokenReader(
  place: GpuNetProfile["places"][number],
  discreteTypeByName: ReadonlyMap<string, "integer" | "boolean">,
  slotExpr: string,
): TokenReader {
  return (fieldName) => {
    const realOrdinal = place.realFields.indexOf(fieldName);
    if (realOrdinal !== -1) {
      return {
        kind: "f32",
        code: `bitcast<f32>(state[${slotExpr} + ${realOrdinal}u])`,
      };
    }

    const discreteOrdinal = place.discreteFields.indexOf(fieldName);
    if (discreteOrdinal === -1) {
      throw new WgslBailError(
        `place \`${place.name}\` has no attribute \`${fieldName}\``,
      );
    }
    const word = `state[${slotExpr} + ${place.realFields.length + discreteOrdinal}u]`;
    // Booleans arrive as a WGSL `bool` rather than a 0/1 float, so a condition
    // reading one composes without an explicit comparison — the HIR's type
    // checker has already established which it is.
    return discreteTypeByName.get(fieldName) === "boolean"
      ? { kind: "bool", code: `(${word} != 0u)` }
      : { kind: "f32", code: `f32(${word})` };
  };
}

/**
 * The name a lambda's `tokens` record uses for one input arc's slot.
 *
 * Taken from `buildLambdaContext` rather than derived from the place name, so
 * component-port scoping and the engine's last-arc-with-a-name-wins rule are
 * whatever the HIR was type-checked against.
 */
function lambdaSlotName(
  transition: SDCPN["transitions"][number],
  arc: SDCPN["transitions"][number]["inputArcs"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings | undefined,
): string {
  const context = buildLambdaContext(sdcpn, transition, extensions);
  // Only one typed input arc is supported, and `inputSlots` holds exactly the
  // typed non-inhibitor arcs, so that arc is the sole slot. Deriving an index
  // from the arc's position among *all* input arcs would be shifted by any
  // uncoloured arc declared before it.
  void arc;
  const slot = context.inputSlots[0];
  if (slot === undefined) {
    throw new WgslBailError(
      `transition \`${transition.name}\` has no lambda input slot for its typed arc`,
    );
  }
  return slot.name;
}

/** One output token's attribute writes, as WGSL words relative to its slot. */
type KernelTokenWrite = { wordOffset: number; valueExpr: string };

/** Where one output arc's tokens go, and what to write into them. */
type KernelOutputWrite = {
  placeIndex: number;
  tokens: KernelTokenWrite[][];
};

/**
 * Reads a transition kernel as the words it writes for each produced token.
 *
 * A kernel body is a record keyed by output slot name, holding one array of
 * `arc.weight` token records each — a plain `recordLit` of `arrayLit` of
 * `recordLit`, with no kernel-specific HIR node. The emitter already turns those
 * into `record`/`array` values, so this walks the emitted structure the same way
 * `hir/emit-buffer-js.ts` does: look each slot up by name, and bail rather than
 * guess if it is missing or the wrong length.
 *
 * The values are returned as expressions rather than written directly, because the
 * caller must evaluate them *before* compacting the input place — a kernel reads
 * the very tokens the firing consumes.
 */
function emitKernel(
  fn: HirFunction,
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
  tokenSlots: ReadonlyMap<string, readonly TokenReader[]>,
  outputs: readonly {
    slotName: string;
    placeIndex: number;
    tokenCount: number;
    place: GpuNetProfile["places"][number];
    discreteTypes: ReadonlyMap<string, "integer" | "boolean">;
  }[],
): { statements: string[]; writes: KernelOutputWrite[] } {
  const emitter = new WgslEmitter({
    parameterValues,
    rngStateVar: "rng_state",
  });
  const env = new Map<string, WgslValue>();
  const tokensParam = fn.params[0];
  if (tokensParam) {
    env.set(tokensParam.name, {
      kind: "record",
      fields: new Map(
        [...tokenSlots].map(([slotName, readers]) => [
          slotName,
          {
            kind: "array" as const,
            elements: readers.map(
              (read): WgslValue => ({ kind: "token", read }),
            ),
          },
        ]),
      ),
    });
  }

  const result = emitter.emit(fn.body, env);
  if (result.kind !== "record") {
    throw new WgslBailError(
      "a transition kernel must return a record of output places to token arrays",
    );
  }

  const writes: KernelOutputWrite[] = [];
  for (const output of outputs) {
    const entry = result.fields.get(output.slotName);
    if (entry === undefined || entry.kind !== "array") {
      throw new WgslBailError(
        `the kernel returns no token array for output place \`${output.slotName}\``,
      );
    }
    if (entry.elements.length !== output.tokenCount) {
      throw new WgslBailError(
        `the kernel returns ${entry.elements.length} token(s) for \`${output.slotName}\`, but its arc weight is ${output.tokenCount}`,
      );
    }

    const tokens = entry.elements.map((element) => {
      if (element.kind !== "record") {
        throw new WgslBailError(
          `the kernel's tokens for \`${output.slotName}\` must be records of attributes`,
        );
      }
      const tokenWrites: KernelTokenWrite[] = [];
      // Reals first, then discretes, matching `eligibility.ts`'s `wordsPerToken`
      // and the reader above.
      for (const [ordinal, field] of output.place.realFields.entries()) {
        const value = element.fields.get(field);
        if (value === undefined) {
          throw new WgslBailError(
            `the kernel does not set \`${field}\` on a token for \`${output.slotName}\``,
          );
        }
        tokenWrites.push({
          wordOffset: ordinal,
          valueExpr: `bitcast<u32>(${emitter.f32(value)})`,
        });
      }
      for (const [ordinal, field] of output.place.discreteFields.entries()) {
        const value = element.fields.get(field);
        if (value === undefined) {
          throw new WgslBailError(
            `the kernel does not set \`${field}\` on a token for \`${output.slotName}\``,
          );
        }
        tokenWrites.push({
          wordOffset: output.place.realFields.length + ordinal,
          valueExpr:
            output.discreteTypes.get(field) === "boolean"
              ? `select(0u, 1u, ${emitter.bool(value)})`
              : `u32(${emitter.f32(value)})`,
        });
      }
      return tokenWrites;
    });

    writes.push({ placeIndex: output.placeIndex, tokens });
  }

  return { statements: [...emitter.statements], writes };
}

/**
 * Reads a transition's lambda as a WGSL boolean-or-rate expression.
 *
 * Lambda HIR takes `(tokens, parameters)`. `tokenSlots` binds `tokens`: one entry
 * per input slot, holding one reader per token the arc consumes. An empty map
 * leaves every slot an empty tuple, which is right for an uncoloured net and
 * makes any lambda that reads attributes bail.
 */
function emitLambda(
  fn: HirFunction,
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
  tokenSlots: ReadonlyMap<string, readonly TokenReader[]> = new Map(),
): { statements: string[]; expression: string; isPredicate: boolean } {
  const emitter = new WgslEmitter({
    parameterValues,
    randomCall: "rng_next_f32(&rng_state)",
  });
  const env = new Map<string, WgslValue>();
  const tokensParam = fn.params[0];
  if (tokensParam) {
    // A slot with no readers stays an empty tuple, which is what an uncoloured
    // place has: no attributes, so nothing to index into.
    env.set(tokensParam.name, {
      kind: "record",
      fields: new Map(
        [...tokenSlots].map(([slotName, readers]) => [
          slotName,
          {
            kind: "array" as const,
            elements: readers.map(
              (read): WgslValue => ({ kind: "token", read }),
            ),
          },
        ]),
      ),
    });
  }

  const value = emitter.emit(fn.body, env);
  if (value.kind === "bool") {
    return {
      statements: [...emitter.statements],
      expression: value.code,
      isPredicate: true,
    };
  }
  return {
    statements: [...emitter.statements],
    expression: emitter.f32(value),
    isPredicate: false,
  };
}

/**
 * Extracts a place's per-token derivative expressions from dynamics HIR.
 *
 * Dynamics HIR is `tokens.map(token => ({ field: expr }))`. Because a token's
 * derivative reads only that token's own attributes, integration is entirely
 * local to one invocation — which is what lets RK4 run without extra dispatches.
 */
/**
 * Strips line terminators from a user-authored name spliced into a WGSL line
 * comment.
 *
 * A line comment runs to the next line break, so a name containing one ends the
 * comment early and drops the rest of the name into the shader as code. Every
 * other channel from user data goes through `mangleWgslIdentifier`, which strips
 * anything outside `[A-Za-z0-9_]`; comments are the one place raw text reaches
 * the shader. Names are unconstrained strings in a loaded document even though
 * the editor's own inputs are single-line.
 */
function commentSafe(name: string): string {
  return name.replaceAll(/[\r\n\u2028\u2029]/gu, " ");
}

function emitDynamics(
  fn: HirFunction,
  realFields: readonly string[],
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
  fieldExpression: (fieldName: string) => string,
  /**
   * Distinguishes this stage's hoisted temporaries from the other stages'. Every
   * stage's statements are spliced into the same WGSL scope, so without it each
   * stage would redeclare the previous stage's names.
   */
  identifierScope: string,
): { statements: string[]; derivatives: Map<string, string> } {
  let body: HirExpr = fn.body;
  const outerBindings = body.kind === "let" ? body.bindings : [];
  if (body.kind === "let") {
    body = body.body;
  }

  const tokensParam = fn.params[0];
  if (
    !tokensParam ||
    body.kind !== "arrayMap" ||
    body.target.kind !== "localRef" ||
    body.target.name !== tokensParam.name
  ) {
    throw new WgslBailError(
      "dynamics must be a direct `tokens.map(...)` over the place's tokens",
    );
  }

  const emitter = new WgslEmitter({ parameterValues, identifierScope });
  const env = new Map<string, WgslValue>();
  for (const binding of outerBindings) {
    env.set(
      binding.name,
      emitter.hoist(binding.name, emitter.emit(binding.value, env)),
    );
  }

  // The token binding resolves attribute reads to whatever accessor the caller
  // supplies, so the same HIR serves each RK stage at a different trial state.
  env.set(body.param.name, {
    kind: "token",
    read: (fieldName) => ({ kind: "f32", code: fieldExpression(fieldName) }),
  });

  let mapBody: HirExpr = body.body;
  if (mapBody.kind === "let") {
    for (const binding of mapBody.bindings) {
      env.set(
        binding.name,
        emitter.hoist(binding.name, emitter.emit(binding.value, env)),
      );
    }
    mapBody = mapBody.body;
  }
  if (mapBody.kind !== "recordLit") {
    throw new WgslBailError("dynamics must return a record of derivatives");
  }

  const derivatives = new Map<string, string>();
  for (const field of realFields) {
    const entry = mapBody.entries.find((candidate) => candidate.key === field);
    // A field with no entry has zero derivative, matching the CPU emitter.
    derivatives.set(
      field,
      entry ? emitter.f32(emitter.emit(entry.value, env)) : "0.0",
    );
  }

  return { statements: [...emitter.statements], derivatives };
}

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
    for (const name of runParameters) {
      const value = parameterValues[name];
      if (value === undefined) {
        throw new WgslBailError(
          `per-run parameter \`${name}\` is not a parameter of this net`,
        );
      }
      if (typeof value !== "number") {
        throw new WgslBailError(
          `per-run parameter \`${name}\` is not numeric; only numeric parameters can vary per run`,
        );
      }
    }
    // Per-run parameters read a hoisted `let` instead of an inlined literal;
    // everything else keeps the literal fast path.
    const emitterParameterValues: Record<string, WgslParameterValue> = {
      ...parameterValues,
      ...Object.fromEntries(
        runParameters.map((name, index) => [
          name,
          { perRun: `run_param_${index}` },
        ]),
      ),
    };
    // Attribute types for the discrete (non-`real`) fields, so a lambda reading a
    // boolean gets a WGSL `bool` rather than a 0/1 float. `eligibility.ts` has
    // already refused anything wider than 32 bits.
    const colorById = new Map(sdcpn.types.map((type) => [type.id, type]));
    const discreteTypesByPlaceId = new Map<
      string,
      Map<string, "integer" | "boolean">
    >();
    for (const place of sdcpn.places) {
      const color =
        place.colorId === null ? undefined : colorById.get(place.colorId);
      const types = new Map<string, "integer" | "boolean">();
      for (const element of color?.elements ?? []) {
        if (element.type === "integer" || element.type === "boolean") {
          types.set(element.name, element.type);
        }
      }
      discreteTypesByPlaceId.set(place.id, types);
    }

    const placeIndexById = new Map(
      profile.places.map((place, index) => [place.id, index]),
    );

    // The largest count any sampled place can reach, or null when one is
    // unbounded. A typed place's count never exceeds its slot capacity, and a
    // declared capacity is enforced by the eligibility constraints emitted
    // below, so both are hard ceilings.
    let sampledCountCeiling: number | null = 0;
    for (const metric of metrics) {
      const place = profile.places[placeIndexById.get(metric.placeId) ?? -1];
      const ceiling = place?.colored
        ? place.capacity
        : place?.declaredCapacity === PLACE_CAPACITY_UNBOUNDED
          ? null
          : (place?.declaredCapacity ?? null);
      if (ceiling === null) {
        sampledCountCeiling = null;
        break;
      }
      sampledCountCeiling = Math.max(sampledCountCeiling, ceiling);
    }
    const histogramBins = histogramBinCount(
      metrics.length,
      sampledCountCeiling,
    );

    // --- State layout -------------------------------------------------------
    // counts | firing counts | rng | status | token values
    const placeCount = profile.places.length;
    const transitionCount = sdcpn.transitions.length;
    const countsOffset = 0;
    const firingsOffset = countsOffset + placeCount;
    const rngOffset = firingsOffset + transitionCount;
    const statusOffset = rngOffset + 1;
    // Places whose capacity the backend derives by probing: each tracks its
    // per-run maximum live count (for capacity decisions) and detects slab
    // overflow instead of blocking a firing the CPU would allow.
    const derivedPlaceIndices = profile.places.flatMap((place, index) =>
      place.capacitySource === "derived" && place.colored ? [index] : [],
    );
    const maxesOffset = statusOffset + 1;
    const tokensOffset = maxesOffset + derivedPlaceIndices.length;

    let tokenWords = 0;
    const placeTokenOffsets: number[] = [];
    const placeTokenStride: number[] = [];
    for (const place of profile.places) {
      placeTokenOffsets.push(tokensOffset + tokenWords);
      const stride = place.realFields.length + place.discreteFields.length;
      placeTokenStride.push(stride);
      tokenWords += place.capacity * stride;
    }
    const stateWordsPerRun = tokensOffset + tokenWords;
    // One word per place count, the status, then each derived place's
    // per-run maximum count. Deliberately not the whole run header:
    // `firings` and the RNG word are device-side bookkeeping the host never
    // decodes.
    const summaryWordsPerRun = placeCount + 1 + derivedPlaceIndices.length;

    const lines: string[] = [];
    const push = (line: string) => lines.push(line);

    push(`// Generated by compile-net-shader.ts — do not edit.`);
    push(
      `// One invocation per run; up to ${framesPerDispatch} frames per dispatch.`,
    );
    push(`const STATE_WORDS: u32 = ${stateWordsPerRun}u;`);
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
    // Each metric's histogram window: bin i covers counts
    // [lo + i*stride, lo + (i+1)*stride). Uniforms, not constants, so the
    // host recalibrates the window between attempts without recompiling.
    for (const [metricIndex] of metrics.entries()) {
      push(`  m${metricIndex}_lo: u32,`);
      push(`  m${metricIndex}_stride: u32,`);
    }
    push(`};`);
    push(`@group(0) @binding(0) var<storage, read_write> state: array<u32>;`);
    push(
      `@group(0) @binding(1) var<storage, read_write> hist: array<atomic<u32>>;`,
    );
    push(`@group(0) @binding(2) var<uniform> config: Config;`);
    // Compact per-run results, gathered on the device so the host never reads the
    // token array back. Of a run's state the host only needs its place counts and
    // its status — a handful of words against hundreds — and the mappable buffer
    // a readback needs is the scarcest memory in the system.
    push(`@group(0) @binding(3) var<storage, read_write> summary: array<u32>;`);
    if (runParameters.length > 0) {
      // One f32 per (run, per-run parameter), run-major, host-filled with
      // each run's parameter draw before the first dispatch.
      push(`@group(0) @binding(4) var<storage, read> run_params: array<f32>;`);
    }
    if (metrics.length > 0) {
      // Per metric: [observed min, observed max, escapes below, escapes
      // above]. Min/max drive window recalibration; the escape counters say
      // whether any sample was clamped into an edge bin.
      push(
        `@group(0) @binding(5) var<storage, read_write> range: array<atomic<u32>>;`,
      );
    }
    push("");
    push(wgslPrelude());
    push("");

    // Per-frame histograms are built in workgroup memory and flushed once per
    // frame. Measured at 2x the throughput of hitting global atomics directly,
    // because runs in a workgroup collide on the same bin constantly.
    if (metrics.length > 0) {
      push(
        `var<workgroup> local_hist: array<atomic<u32>, ${histogramBins * metrics.length}>;`,
      );
      // Workgroup-reduced observed range, flushed once per frame per
      // workgroup — the same trick as local_hist, for the same reason.
      push(`var<workgroup> local_min: array<atomic<u32>, ${metrics.length}>;`);
      push(`var<workgroup> local_max: array<atomic<u32>, ${metrics.length}>;`);
      push("");
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
    for (const [slot] of derivedPlaceIndices.entries()) {
      push(`  var max_count_${slot}: u32 = 0u;`);
    }
    for (let index = 0; index < runParameters.length; index++) {
      push(`  var run_param_${index}: f32 = 0.0;`);
    }
    push(`  if (in_range) {`);
    for (let index = 0; index < placeCount; index++) {
      push(`    counts[${index}u] = state[base + ${countsOffset + index}u];`);
    }
    for (let index = 0; index < transitionCount; index++) {
      push(`    firings[${index}u] = state[base + ${firingsOffset + index}u];`);
    }
    push(`    rng_state = state[base + ${rngOffset}u];`);
    push(`    status = state[base + ${statusOffset}u];`);
    for (const [slot] of derivedPlaceIndices.entries()) {
      push(`    max_count_${slot} = state[base + ${maxesOffset + slot}u];`);
    }
    for (let index = 0; index < runParameters.length; index++) {
      push(
        `    run_param_${index} = run_params[run_index * ${runParameters.length}u + ${index}u];`,
      );
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

    // --- Continuous dynamics ------------------------------------------------
    const dynamicsPlaces = profile.places
      .map((place, index) => ({ place, index }))
      .filter(
        ({ place }) => dynamicsHir.has(place.id) && place.realFields.length > 0,
      );

    for (const { place, index } of dynamicsPlaces) {
      const stride = placeTokenStride[index]!;
      const tokenBase = placeTokenOffsets[index]!;
      const fieldIndex = (field: string) => place.realFields.indexOf(field);

      push(`    // dynamics: ${commentSafe(place.name)} (${odeMethod})`);
      push(`    if (running) {`);
      push(`      for (var t: u32 = 0u; t < counts[${index}u]; t = t + 1u) {`);
      push(`        let slot = base + ${tokenBase}u + t * ${stride}u;`);
      for (const [ordinal] of place.realFields.entries()) {
        push(
          `        let y${ordinal} = bitcast<f32>(state[slot + ${ordinal}u]);`,
        );
      }

      // Each RK stage re-emits the same derivative HIR against a trial state,
      // which is sound because a token's derivative depends only on that token.
      const stageNames =
        odeMethod === "euler"
          ? ["k1"]
          : odeMethod === "rk2"
            ? ["k1", "k2"]
            : ["k1", "k2", "k3", "k4"];
      const trialFor = (stage: number, ordinal: number): string => {
        if (stage === 0) return `y${ordinal}`;
        if (odeMethod === "rk2")
          return `(y${ordinal} + 0.5 * DT * k1_${ordinal})`;
        if (stage === 1) return `(y${ordinal} + 0.5 * DT * k1_${ordinal})`;
        if (stage === 2) return `(y${ordinal} + 0.5 * DT * k2_${ordinal})`;
        return `(y${ordinal} + DT * k3_${ordinal})`;
      };

      for (const [stage, stageName] of stageNames.entries()) {
        const { statements, derivatives } = emitDynamics(
          dynamicsHir.get(place.id)!,
          place.realFields,
          emitterParameterValues,
          (fieldName) => {
            const ordinal = fieldIndex(fieldName);
            if (ordinal < 0) {
              throw new WgslBailError(
                `dynamics for \`${place.name}\` reads \`${fieldName}\`, which is not a real attribute`,
              );
            }
            return trialFor(stage, ordinal);
          },
          `${stageName}_`,
        );
        for (const statement of statements) {
          push(`        ${statement}`);
        }
        for (const [ordinal, field] of place.realFields.entries()) {
          push(
            `        let ${stageName}_${ordinal}: f32 = ${derivatives.get(field) ?? "0.0"};`,
          );
        }
      }

      for (const [ordinal] of place.realFields.entries()) {
        const combined =
          odeMethod === "euler"
            ? `y${ordinal} + DT * k1_${ordinal}`
            : odeMethod === "rk2"
              ? `y${ordinal} + DT * k2_${ordinal}`
              : `y${ordinal} + (DT / 6.0) * (k1_${ordinal} + 2.0 * k2_${ordinal} + 2.0 * k3_${ordinal} + k4_${ordinal})`;
        push(`        state[slot + ${ordinal}u] = bitcast<u32>(${combined});`);
      }
      push(`      }`);
      push(`    }`);
      push("");
    }

    // --- Discrete transitions ----------------------------------------------
    // Removals apply immediately so later transitions see them, matching the CPU
    // engine; additions are held until the end of the frame, so capacity checks
    // fold in what earlier transitions already produced this frame.
    push(`    var pending: array<i32, ${Math.max(placeCount, 1)}>;`);
    for (let index = 0; index < placeCount; index++) {
      push(`    pending[${index}u] = 0;`);
    }
    push(`    var any_fired = false;`);
    push(`    var any_enabled = false;`);
    push("");

    const compiledLambdas: string[] = [];

    for (const [transitionIndex, transition] of sdcpn.transitions.entries()) {
      const inputs = transition.inputArcs
        .map((arc) => ({ arc, placeId: getArcEndpointPlaceId(arc) }))
        .filter(
          (entry): entry is { arc: typeof entry.arc; placeId: string } =>
            entry.placeId !== null,
        );
      const outputs = transition.outputArcs
        .map((arc) => ({ arc, placeId: getArcEndpointPlaceId(arc) }))
        .filter(
          (entry): entry is { arc: typeof entry.arc; placeId: string } =>
            entry.placeId !== null,
        );

      const capacityConstraints = computeTransitionCapacityConstraints({
        transition,
        placeIndexById,
        // The declared limit, not the slot allocation: an uncoloured place
        // has no slots but may still be capped, and the CPU path enforces
        // that cap, so dropping it here would make the two backends diverge.
        placeCapacities: Uint32Array.from(
          profile.places.map((place) => place.declaredCapacity),
        ),
      });

      const guards: string[] = [];
      for (const { arc, placeId } of inputs) {
        const index = placeIndexById.get(placeId);
        if (index === undefined) {
          throw new WgslBailError(
            `transition references unknown place ${placeId}`,
          );
        }
        guards.push(
          arc.type === "inhibitor"
            ? `counts[${index}u] < ${arc.weight}u`
            : `counts[${index}u] >= ${arc.weight}u`,
        );
      }
      for (const constraint of capacityConstraints) {
        // `pending` is signed so a place that both gained and lost tokens this
        // frame nets out correctly before the comparison.
        guards.push(
          `(i32(counts[${constraint.placeIndex}u]) + pending[${constraint.placeIndex}u] + ${constraint.delta}) <= ${constraint.capacity}`,
        );
      }

      const enabled = guards.length > 0 ? guards.join(" && ") : "true";
      push(`    // transition: ${commentSafe(transition.name)}`);
      push(`    {`);
      push(`      let structurally_enabled = running && (${enabled});`);
      push(`      any_enabled = any_enabled || structurally_enabled;`);

      // Typed standard inputs need a *choice* of which tokens to consume, and the
      // CPU makes it by walking `indexCombinations` and firing on the first
      // passing combination. Exactly one such arc is supported: more than one
      // means a Cartesian product across arcs, which is a nested scan.
      const typedInputs = inputs.filter(
        ({ arc, placeId }) =>
          arc.type === "standard" &&
          (profile.places[placeIndexById.get(placeId)!]?.colored ?? false),
      );
      if (typedInputs.length > 1) {
        throw new WgslBailError(
          `transition \`${transition.name}\` consumes typed tokens from ${typedInputs.length} places; only one is supported`,
        );
      }
      const typedInput = typedInputs[0];
      if (typedInput !== undefined && typedInput.arc.weight > 2) {
        throw new WgslBailError(
          `transition \`${transition.name}\` consumes ${typedInput.arc.weight} tokens from \`${typedInput.placeId}\`; at most two per place are supported`,
        );
      }
      const typedWeight = typedInput?.arc.weight ?? 0;

      const tokenSlots = new Map<string, readonly TokenReader[]>();
      const selectionTokenSlots = new Map<string, readonly TokenReader[]>();
      let scanPlaceIndex: number | null = null;
      if (typedInput !== undefined) {
        // A local const, so the reader closures below capture a `number` rather
        // than the wider `number | null` of the outer binding.
        const placeIndex = placeIndexById.get(typedInput.placeId)!;
        scanPlaceIndex = placeIndex;
        const place = profile.places[placeIndex]!;
        const slotName = lambdaSlotName(
          transition,
          typedInput.arc,
          sdcpn,
          extensions,
        );
        const discreteTypes = discreteTypesByPlaceId.get(place.id) ?? new Map();
        const slotExprFor = (candidateVar: string) =>
          `(base + ${placeTokenOffsets[placeIndex]!}u + ${candidateVar} * ${placeTokenStride[placeIndex]!}u)`;
        // One reader per token the arc consumes, in the order the lambda
        // destructures them: `const [a, b] = tokens.Space`.
        const candidateVars =
          typedWeight === 2 ? ["cand_i", "cand_j"] : ["cand_0"];
        tokenSlots.set(
          slotName,
          candidateVars.map((candidateVar) =>
            makeTokenReader(place, discreteTypes, slotExprFor(candidateVar)),
          ),
        );
        // The same readers against the *chosen* slots, for the kernel: it runs in
        // the fire block, after the scan has settled on `sel_*`.
        const selectionVarsForSlot =
          typedWeight === 2 ? ["sel_0", "sel_1"] : ["sel_0"];
        selectionTokenSlots.set(
          slotName,
          selectionVarsForSlot.map((selectionVar) =>
            makeTokenReader(place, discreteTypes, slotExprFor(selectionVar)),
          ),
        );
      }

      // Declared outside the lambda branch: a typed-input transition with no
      // lambda still consumes tokens, and the CPU takes combination 0 in that
      // case, so the compaction below needs these either way.
      const selectionVars =
        typedWeight === 2
          ? ["sel_0", "sel_1"]
          : typedWeight === 1
            ? ["sel_0"]
            : [];
      for (const selectionVar of selectionVars) {
        push(`      var ${selectionVar}: u32 = 0u;`);
      }
      if (typedWeight === 2) {
        // Combination 0 of `indexCombinations(n, 2)` is the pair (0, 1), which is
        // what the CPU consumes when there is no condition to fail.
        push(`      sel_1 = 1u;`);
      }

      const lambda = lambdaHir.get(transition.id);
      let fireCondition: string;
      if (lambda) {
        const emitted = emitLambda(lambda, emitterParameterValues, tokenSlots);
        compiledLambdas.push(transition.id);
        push(`      var fires = false;`);
        push(`      if (structurally_enabled) {`);

        // The CPU draws its acceptance uniform once per enabled transition
        // per frame, before walking combinations, reuses it for every one,
        // and consumes it whether or not the transition fires
        // (`monte-carlo/transition-effect.ts`). Drawing inside the scan
        // would give a place holding more tokens more chances to clear the
        // threshold, so it would fire measurably sooner; not consuming the
        // draw would accumulate the hazard over the idle window instead of
        // testing a memoryless per-frame Bernoulli over dt.
        const isStochastic = !emitted.isPredicate;
        if (isStochastic) {
          push(`        let u = rng_next_f32(&rng_state);`);
        }
        const acceptance = isStochastic
          ? `accepts_firing(${emitted.expression}, DT, u)`
          : emitted.expression;

        if (typedWeight === 2) {
          // The readers bound above already name `cand_i` and `cand_j`, which is
          // what the scan declares, so the statements need no rewriting.
          for (const line of emitPairScanWgsl({
            tokenCountExpr: `counts[${scanPlaceIndex!}u]`,
            emitAccepts: () => ({
              statements: emitted.statements,
              expression: acceptance,
            }),
            firedVar: "fires",
            firstVar: "sel_0",
            secondVar: "sel_1",
            indent: "        ",
          })) {
            push(line);
          }
        } else if (typedWeight === 1) {
          push(
            `        for (var cand_0: u32 = 0u; cand_0 < counts[${scanPlaceIndex!}u]; cand_0 = cand_0 + 1u) {`,
          );
          for (const statement of emitted.statements) {
            push(`          ${statement}`);
          }
          push(`          fires = ${acceptance};`);
          push(`          if (fires) { sel_0 = cand_0; break; }`);
          push(`        }`);
        } else {
          for (const statement of emitted.statements) {
            push(`        ${statement}`);
          }
          push(`        fires = ${acceptance};`);
        }

        push(`      }`);
        fireCondition = "fires";
      } else {
        // No lambda compiled: always enabled once structure permits, matching
        // the CPU engine's default.
        fireCondition = "structurally_enabled";
      }

      push(`      if (${fireCondition}) {`);

      // A kernel reads the tokens this firing consumes, so its values are
      // evaluated into `let`s *before* compaction destroys them, and written
      // after. The CPU does the same by computing `effect.add` from the frame it
      // then removes from (`monte-carlo/advance-run.ts`).
      const kernel = kernelHir.get(transition.id);
      const typedOutputs = outputs
        .map(({ arc, placeId }) => {
          const index = placeIndexById.get(placeId)!;
          const place = profile.places[index]!;
          return { arc, placeId, index, place };
        })
        .filter(({ place }) => place.colored);
      let kernelWrites: KernelOutputWrite[] = [];
      if (typedOutputs.length > 0) {
        if (kernel === undefined) {
          throw new WgslBailError(
            `transition \`${transition.name}\` produces typed tokens but its kernel carried no HIR, so their attributes cannot be written`,
          );
        }
        const kernelContext = buildKernelContext(sdcpn, transition, extensions);
        const emittedKernel = emitKernel(
          kernel,
          emitterParameterValues,
          // The kernel runs in the fire block, where the chosen tokens are named
          // `sel_*` rather than the scan's `cand_*`.
          selectionTokenSlots,
          typedOutputs.map(({ index, place }, ordinal) => ({
            slotName:
              kernelContext.outputSlots[ordinal]?.name ??
              (() => {
                throw new WgslBailError(
                  `transition \`${transition.name}\` has no kernel output slot for \`${place.name}\``,
                );
              })(),
            placeIndex: index,
            tokenCount: typedOutputs[ordinal]!.arc.weight,
            place,
            discreteTypes: discreteTypesByPlaceId.get(place.id) ?? new Map(),
          })),
        );
        for (const statement of emittedKernel.statements) {
          push(`        ${statement}`);
        }
        // Every produced value is forced into a `let` here, before compaction.
        // The emitter hoists only the subexpressions it names, so a direct read
        // like `x: tokens.Space[0].x` would otherwise stay inline in the write
        // below and execute *after* compaction had overwritten that slot with a
        // survivor — reading the wrong token's attributes.
        let hoistOrdinal = 0;
        kernelWrites = emittedKernel.writes.map((write) => ({
          placeIndex: write.placeIndex,
          tokens: write.tokens.map((tokenWrites) =>
            tokenWrites.map(({ wordOffset, valueExpr }) => {
              const name = `kout_${hoistOrdinal}`;
              hoistOrdinal += 1;
              push(`        let ${name}: u32 = ${valueExpr};`);
              return { wordOffset, valueExpr: name };
            }),
          ),
        }));
      }

      if (scanPlaceIndex !== null) {
        const stride = placeTokenStride[scanPlaceIndex]!;
        const tokenBase = placeTokenOffsets[scanPlaceIndex]!;
        // Stable compaction, matching `monte-carlo/frame-operations.ts`: survivors
        // keep their relative order and shift down into the gaps. A swap-remove
        // would reorder the array, so later frames would enumerate candidates in a
        // different order and consume different tokens — divergence, not noise.
        // Nothing below the lowest removed slot moves, so the sweep starts there.
        // The sweep starts past `sel_0`, so only the higher slots need skipping —
        // comparing against `sel_0` again would be dead code in the shader.
        const skipped = selectionVars
          .slice(1)
          .map((selectionVar) => `m == ${selectionVar}`)
          .join(" || ");
        push(
          `        // consume ${typedWeight} token(s) from ${commentSafe(profile.places[scanPlaceIndex]!.name)}`,
        );
        push(`        var write_slot: u32 = sel_0;`);
        push(
          `        for (var m: u32 = sel_0 + 1u; m < counts[${scanPlaceIndex}u]; m = m + 1u) {`,
        );
        if (skipped !== "") {
          push(`          if (${skipped}) { continue; }`);
        }
        push(`          let src = base + ${tokenBase}u + m * ${stride}u;`);
        push(
          `          let dst = base + ${tokenBase}u + write_slot * ${stride}u;`,
        );
        push(`          if (dst != src) {`);
        push(`            for (var w: u32 = 0u; w < ${stride}u; w = w + 1u) {`);
        push(`              state[dst + w] = state[src + w];`);
        push(`            }`);
        push(`          }`);
        push(`          write_slot = write_slot + 1u;`);
        push(`        }`);
      }
      for (const { arc, placeId } of inputs) {
        if (arc.type !== "standard") {
          continue;
        }
        const index = placeIndexById.get(placeId)!;
        push(`        counts[${index}u] = counts[${index}u] - ${arc.weight}u;`);
      }
      for (const { arc, placeId } of outputs) {
        const index = placeIndexById.get(placeId)!;
        // Produced tokens are written above the live count and revealed only when
        // `pending` folds into `counts` at end of frame, so nothing later in this
        // frame can consume them — matching the CPU, which defers additions to
        // after its transition loop while tracking the count in
        // `pendingOutputCounts`.
        const write = kernelWrites.find((entry) => entry.placeIndex === index);
        if (write !== undefined) {
          const stride = placeTokenStride[index]!;
          const tokenBase = placeTokenOffsets[index]!;
          for (const [tokenOrdinal, tokenWrites] of write.tokens.entries()) {
            push(`        {`);
            push(
              `          let out = base + ${tokenBase}u + (counts[${index}u] + u32(max(0, pending[${index}u])) + ${tokenOrdinal}u) * ${stride}u;`,
            );
            for (const { wordOffset, valueExpr } of tokenWrites) {
              push(`          state[out + ${wordOffset}u] = ${valueExpr};`);
            }
            push(`        }`);
          }
        }
        push(
          `        pending[${index}u] = pending[${index}u] + ${arc.weight};`,
        );
      }
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
    // Derived capacities detect overflow instead of blocking: the highest
    // slot a frame writes is its post-fold count minus one, so a post-fold
    // count past the slab means this frame wrote out of bounds (harmlessly —
    // robust buffer access clamps, and any overflow discards the attempt).
    // Status 3 halts the run and tells the host to grow the slab and re-run.
    for (const [slot, placeIndex] of derivedPlaceIndices.entries()) {
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

    // --- Metrics ------------------------------------------------------------
    if (metrics.length > 0) {
      push(`    // per-frame histograms, reduced in workgroup memory`);
      push(
        `    for (var b: u32 = lid; b < ${histogramBins * metrics.length}u; b = b + ${GPU_WORKGROUP_SIZE}u) {`,
      );
      push(`      atomicStore(&local_hist[b], 0u);`);
      push(`    }`);
      push(
        `    for (var m: u32 = lid; m < ${metrics.length}u; m = m + ${GPU_WORKGROUP_SIZE}u) {`,
      );
      push(`      atomicStore(&local_min[m], 0xffffffffu);`);
      push(`      atomicStore(&local_max[m], 0u);`);
      push(`    }`);
      push(`    workgroupBarrier();`);
      for (const [metricIndex, metric] of metrics.entries()) {
        const placeIndex = placeIndexById.get(metric.placeId);
        if (placeIndex === undefined) {
          throw new WgslBailError(
            `metric \`${metric.id}\` references unknown place ${metric.placeId}`,
          );
        }
        // Samples only runs still active after this frame's step: the CPU
        // metric default excludes a run in the frame it deadlocks or
        // completes, because its status flips before the observation.
        // A sample outside the window clamps into the edge bin and is
        // counted as an escape, which triggers a recalibrated re-run — the
        // clamped picture is only ever an intermediate.
        push(`    if (running && status == 0u) {`);
        push(`      let c${metricIndex} = counts[${placeIndex}u];`);
        push(`      atomicMin(&local_min[${metricIndex}u], c${metricIndex});`);
        push(`      atomicMax(&local_max[${metricIndex}u], c${metricIndex});`);
        push(`      var bin${metricIndex}: u32;`);
        push(`      if (c${metricIndex} < config.m${metricIndex}_lo) {`);
        push(`        atomicAdd(&range[${metricIndex * 4 + 2}u], 1u);`);
        push(`        bin${metricIndex} = 0u;`);
        push(`      } else {`);
        push(
          `        bin${metricIndex} = (c${metricIndex} - config.m${metricIndex}_lo) / config.m${metricIndex}_stride;`,
        );
        push(`        if (bin${metricIndex} >= HIST_BINS) {`);
        push(`          atomicAdd(&range[${metricIndex * 4 + 3}u], 1u);`);
        push(`          bin${metricIndex} = HIST_BINS - 1u;`);
        push(`        }`);
        push(`      }`);
        push(
          `      atomicAdd(&local_hist[${metricIndex * histogramBins}u + bin${metricIndex}], 1u);`,
        );
        push(`    }`);
      }
      push(`    workgroupBarrier();`);
      push(
        `    for (var b: u32 = lid; b < ${histogramBins * metrics.length}u; b = b + ${GPU_WORKGROUP_SIZE}u) {`,
      );
      push(`      let v = atomicLoad(&local_hist[b]);`);
      push(`      if (v > 0u) {`);
      push(
        `        atomicAdd(&hist[absolute_frame * ${histogramBins * metrics.length}u + b], v);`,
      );
      push(`      }`);
      push(`    }`);
      push(
        `    for (var m: u32 = lid; m < ${metrics.length}u; m = m + ${GPU_WORKGROUP_SIZE}u) {`,
      );
      push(`      let lo = atomicLoad(&local_min[m]);`);
      push(`      if (lo != 0xffffffffu) {`);
      push(`        atomicMin(&range[m * 4u], lo);`);
      push(
        `        atomicMax(&range[m * 4u + 1u], atomicLoad(&local_max[m]));`,
      );
      push(`      }`);
      push(`    }`);
      push(`    workgroupBarrier();`);
    }

    push(`  }`);
    push("");

    // Store state back for the next chunk.
    push(`  if (in_range) {`);
    for (let index = 0; index < placeCount; index++) {
      push(`    state[base + ${countsOffset + index}u] = counts[${index}u];`);
    }
    for (let index = 0; index < transitionCount; index++) {
      push(`    state[base + ${firingsOffset + index}u] = firings[${index}u];`);
    }
    push(`    state[base + ${rngOffset}u] = rng_state;`);
    push(`    state[base + ${statusOffset}u] = status;`);
    for (const [slot] of derivedPlaceIndices.entries()) {
      push(`    state[base + ${maxesOffset + slot}u] = max_count_${slot};`);
    }
    push("");

    // The compact result the host reads back, written from the same registers
    // rather than gathered by a second pass: the values are already here, so a
    // separate entry point would re-read them from memory for nothing. Written
    // every dispatch and overwritten by the next, so after the final dispatch it
    // holds the final state — which is all the host ever wanted.
    push(`    let summary_base = run_index * ${summaryWordsPerRun}u;`);
    for (let index = 0; index < placeCount; index++) {
      push(`    summary[summary_base + ${index}u] = counts[${index}u];`);
    }
    push(`    summary[summary_base + ${placeCount}u] = status;`);
    for (const [slot] of derivedPlaceIndices.entries()) {
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
        stateWordsPerRun,
        summaryWordsPerRun,
        placeCountOffsets: profile.places.map(
          (_, index) => countsOffset + index,
        ),
        placeTokenOffsets: [...placeTokenOffsets],
        placeTokenStrides: [...placeTokenStride],
        summaryStatusOffset: placeCount,
        rngOffset,
        statusOffset,
        derivedCapacityPlaceIndices: [...derivedPlaceIndices],
        metricIds: metrics.map((metric) => metric.id),
        histogramBins,
        runParameterIds: [...runParameters],
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
