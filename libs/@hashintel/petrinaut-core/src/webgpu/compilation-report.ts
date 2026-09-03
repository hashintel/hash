/**
 * Explains, per net and per item, what the compilation pipeline made of a net:
 * which user code lowered to HIR, and what the GPU backend can and cannot take.
 *
 * This exists because the pipeline has three independent gates that fail in
 * different places, and only the first one produces a good message:
 *
 * 1. `assessGpuEligibility` — structural, checked up front, reports named reasons.
 * 2. `compileNetShader` — bails while emitting WGSL, with a message written for
 *    whoever wrote the emitter (`field access on a array, which has no fields`)
 *    rather than for whoever wrote the net.
 * 3. `toGpuMetricSpecs` — refuses metric shapes the on-GPU histogram cannot serve.
 *
 * A user hitting gate 2 or 3 currently sees a single fallback sentence and has no
 * way to find out which transition caused it. This report attributes each failure
 * to an item so the UI can point at it.
 *
 * It is deliberately read-only and device-free: it answers "would this compile"
 * without acquiring a GPU, so it can run while editing.
 */
import { resolveNetParameterValues } from "../parameter-values";
import { compileNetShader } from "./compile-net-shader";
import { assessGpuEligibility } from "./eligibility";
import { toGpuMetricSpecs } from "./gpu-metric-frames";
import { hirFromArtifacts } from "./hir-from-artifacts";
import { tryTranslateKernel } from "./try-translate-kernel";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { MonteCarloMetricSpec } from "../simulation/monte-carlo/metrics/types";
import type { SDCPN } from "../types/sdcpn";
import type { GpuIneligibilityReason } from "./eligibility";

/** What kind of user code an item carries. */
export type CompilationItemKind = "lambda" | "kernel" | "dynamics";

export type CompilationItemStatus =
  /** Lowered to HIR and emittable as WGSL. */
  | "gpu-ready"
  /** Lowered to HIR, but the GPU emitter cannot take it. */
  | "cpu-only"
  /**
   * Lowered to HIR, but the net was refused before emission ran, so whether this
   * item would emit is genuinely unknown. Reporting it as GPU-ready would claim
   * something that was never tested.
   */
  | "not-attempted"
  /** No HIR — either it never compiled, or artifacts were built without it. */
  | "no-hir"
  /** The relevant extension is off, so the engine does not use this code. */
  | "disabled";

export type CompilationItemReport = {
  /** Place, transition or differential-equation id, for selecting the item. */
  itemId: string;
  itemName: string;
  kind: CompilationItemKind;
  status: CompilationItemStatus;
  /** Why it is not `gpu-ready`, phrased for the net's author. */
  detail: string | null;
  /** Node count of the lowered HIR body, when there is one. */
  hirNodeCount: number | null;
};

export type CompilationReport = {
  /** True when the whole net would run on the GPU as configured. */
  gpuReady: boolean;
  /** Structural reasons the net was refused before any code was emitted. */
  eligibilityReasons: GpuIneligibilityReason[];
  /** Set when the net was structurally eligible but shader emission failed. */
  shaderFailure: string | null;
  /** Bytes of GPU state one run needs, when known. */
  bytesPerRun: number | null;
  /** Generated WGSL, when emission succeeded. Shown verbatim in the UI. */
  wgsl: string | null;
  /** Why the configured metrics cannot be served on the GPU, if they cannot. */
  metricFailure: string | null;
  items: CompilationItemReport[];
};

function countHirNodes(node: unknown): number {
  if (node === null || typeof node !== "object") {
    return 0;
  }
  if (Array.isArray(node)) {
    let total = 0;
    for (const entry of node) {
      total += countHirNodes(entry);
    }
    return total;
  }

  // Spans are position data, not expression structure, so they are not counted.
  let total = "kind" in node ? 1 : 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === "span") {
      continue;
    }
    total += countHirNodes(value);
  }
  return total;
}

export type AnalyzeCompilationInput = {
  sdcpn: SDCPN;
  /** Must come from `compileHirArtifacts(..., { includeHir: true })`. */
  artifacts: HirArtifacts;
  extensions?: PetrinautExtensionSettings;
  /**
   * Resolved net parameter values. The shader inlines parameters as literals, so
   * omitting one makes emission fail with `unknown parameter ...` — which reads
   * as a defect in the net rather than a missing argument. Defaults to each
   * parameter's own declared default, which is what the net means on its own.
   */
  parameterValues?: Readonly<Record<string, number | boolean>>;
  /** Metric specs an experiment would run. Omit to skip the metric gate. */
  metricSpecs?: readonly MonteCarloMetricSpec[];
  dt?: number;
};

export function analyzeCompilation({
  sdcpn,
  artifacts,
  extensions,
  parameterValues,
  metricSpecs,
  dt = 0.1,
}: AnalyzeCompilationInput): CompilationReport {
  // The canonical resolver, so the report inlines the same literals a real run
  // would. Absent values fail emission with `unknown parameter ...`, which reads
  // as a defect in the net rather than a missing argument.
  const resolvedParameterValues =
    parameterValues ??
    resolveNetParameterValues(
      sdcpn.parameters,
      {},
      extensions?.parameters ?? true,
    );
  const netHir = hirFromArtifacts(sdcpn, artifacts, extensions);
  const eligibility = assessGpuEligibility(sdcpn);

  let shaderFailure: string | null = null;
  let wgsl: string | null = null;
  let bytesPerRun: number | null = null;

  if (eligibility.eligible) {
    bytesPerRun = eligibility.profile.bytesPerRun;
    const compiled = compileNetShader({
      sdcpn,
      profile: eligibility.profile,
      parameterValues: resolvedParameterValues,
      lambdaHir: netHir.lambdas,
      dynamicsHir: netHir.dynamics,
      kernelHir: netHir.kernels,
      extensions,
      dt,
      // Only affects the emitted loop bound, not whether emission succeeds.
      framesPerDispatch: 64,
      metrics: [],
      odeMethod: "rk4",
    });
    if (compiled.ok) {
      wgsl = compiled.shader.wgsl;
    } else {
      shaderFailure = compiled.reason;
    }
  }

  let metricFailure: string | null = null;
  if (metricSpecs !== undefined && metricSpecs.length > 0) {
    const gpuMetrics = toGpuMetricSpecs(metricSpecs);
    if (!gpuMetrics.ok) {
      metricFailure = gpuMetrics.reason;
    }
  }

  // Attributing a shader bail to one item would mean re-emitting each in
  // isolation, which can succeed where the whole net fails. Instead, mark every
  // item that could have caused it and say so once, in `shaderFailure`.
  const items: CompilationItemReport[] = [];

  /** Status for an item whose HIR exists, given how far the pipeline got. */
  const emittedStatus: CompilationItemStatus = !eligibility.eligible
    ? "not-attempted"
    : shaderFailure === null
      ? "gpu-ready"
      : "cpu-only";
  const emittedDetail: string | null = !eligibility.eligible
    ? "The net was refused before shader emission, so this was never tried."
    : shaderFailure;

  const skippedReasonByItemId = new Map(
    netHir.skipped.map((entry) => [entry.itemId, entry.reason]),
  );

  for (const transition of sdcpn.transitions) {
    if (transition.lambdaCode.trim() === "") {
      continue;
    }
    const hir = netHir.lambdas.get(transition.id);
    const skipped = skippedReasonByItemId.get(transition.id);
    items.push({
      itemId: transition.id,
      itemName: transition.name,
      kind: "lambda",
      status:
        hir !== undefined
          ? emittedStatus
          : skipped !== undefined
            ? "no-hir"
            : "disabled",
      detail:
        hir !== undefined
          ? emittedDetail
          : (skipped ?? "Stochasticity is off, so this condition is not used."),
      hirNodeCount: hir ? countHirNodes(hir.body) : null,
    });
  }

  for (const place of sdcpn.places) {
    if (place.dynamicsEnabled !== true) {
      continue;
    }
    const hir = netHir.dynamics.get(place.id);
    items.push({
      itemId: place.id,
      itemName: place.name,
      kind: "dynamics",
      status: hir !== undefined ? emittedStatus : "no-hir",
      detail: hir !== undefined ? emittedDetail : "No HIR for this place.",
      hirNodeCount: hir ? countHirNodes(hir.body) : null,
    });
  }

  for (const transition of sdcpn.transitions) {
    if (transition.transitionKernelCode.trim() === "") {
      continue;
    }
    // A kernel is only compiled when the transition has a typed output place
    // (`isTransitionKernelAvailable`). Without one, neither engine uses the code
    // at all — reporting it as "the GPU cannot run kernels" blamed the backend
    // for something no backend does here.
    if (artifacts.kernels[transition.id] === undefined) {
      items.push({
        itemId: transition.id,
        itemName: transition.name,
        kind: "kernel",
        status: "disabled",
        detail:
          "This transition has no typed output place, so neither engine uses its kernel.",
        hirNodeCount: null,
      });
      continue;
    }

    const hir = netHir.kernels.get(transition.id);
    // The detail says which kind of blocked a kernel is when translation
    // fails, because "the backend cannot express this" and "this kernel uses
    // a string attribute" are the same outcome and completely different work.
    const translation =
      hir === undefined
        ? null
        : tryTranslateKernel({
            sdcpn,
            transition,
            hir,
            extensions,
            parameterValues: resolvedParameterValues,
          });
    items.push({
      itemId: transition.id,
      itemName: transition.name,
      kind: "kernel",
      status:
        hir === undefined
          ? "no-hir"
          : // A failed translation is a *tested* negative, so it stays `cpu-only`
            // even when the net was refused before emission ran. Only a successful
            // translation defers to how far the pipeline got.
            translation?.translatable === false
            ? "cpu-only"
            : emittedStatus,
      detail:
        translation === null
          ? "Its compiled artifact carries no HIR, so it cannot be translated."
          : translation.translatable
            ? emittedDetail
            : `Cannot be translated to WGSL: ${translation.reason}`,
      hirNodeCount: hir ? countHirNodes(hir.body) : null,
    });
  }

  return {
    gpuReady:
      eligibility.eligible && shaderFailure === null && metricFailure === null,
    eligibilityReasons: eligibility.eligible ? [] : eligibility.reasons,
    shaderFailure,
    bytesPerRun,
    wgsl,
    metricFailure,
    items,
  };
}

/**
 * One sentence explaining why the GPU cannot run this net, or `null` when it can.
 *
 * For a disabled control's tooltip, where there is room for one reason rather
 * than a list. Ordered by how actionable each kind is, not by where the pipeline
 * happened to stop: a named structural reason tells the author what to change,
 * whereas the emitter's own message describes an expression tree. The Compilation
 * panel shows the full picture.
 */
export function summarizeGpuUnavailability(
  report: CompilationReport,
): string | null {
  if (report.gpuReady) {
    return null;
  }

  const others = (count: number) => (count > 1 ? ` (+${count - 1} more)` : "");

  const [firstReason] = report.eligibilityReasons;
  if (firstReason !== undefined) {
    return `${firstReason.message}${others(report.eligibilityReasons.length)}`;
  }

  if (report.metricFailure !== null) {
    return report.metricFailure;
  }

  if (report.shaderFailure !== null) {
    return `This net's code cannot be compiled to a GPU shader: ${report.shaderFailure}`;
  }

  // `gpuReady` is false only when one of the above is set, so this is
  // unreachable — but returning a vague sentence beats returning null and
  // silently enabling a control that will fall back.
  return "The GPU backend cannot run this net.";
}
