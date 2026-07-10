import { computePeriodCost } from "../../shared/cost";
import {
  computeIqrFences,
  type IqrFences,
} from "../../shared/outlier-selection/iqr";

import type {
  BatchRow,
  BindingScore,
  GraphNode,
  NextBottleneckChain,
  PipelineStage,
  StepContributions,
  StepType,
} from "../../shared/types";

/**
 * Critical-path semantics for the E2E what-if simulator.
 *
 * Upstream contributions are modelled as a list of parallel chains
 * (`step_contributions.upstream_chains`). Each chain is leaf-first; the
 * chain's `total_days` is its contribution to the
 * "Production Start -> consumed by FG" window. The E2E upstream span is
 * the max of all chain totals. Reducing a step that is not on the binding
 * chain yields zero E2E saving until its chain's new total drops the
 * binding chain's lead.
 *
 * Lever semantics: each lever value is a CAP in days. Missing values or a
 * cap at/above the step's observed max mean "uncapped" (no change). Moving
 * the lever left picks stricter percentile checkpoints (P95/P75/median/P25).
 * For each batch occurrence of that step, the simulator applies:
 *
 *   simulated_duration = min(baseline_duration, cap_days)
 *
 * Durations below the cap are unchanged; only the tail above the selected
 * checkpoint is shortened. KPI numbers reflect recomputed per-batch chain
 * totals after tail capping, not a uniform shift.
 *
 * Procurement and raw-material dwell are excluded from the lever list --
 * the pre-production segment is held constant in the simulated bars.
 */

export interface LeverDefinition {
  stepId: string;
  label: string;
  stepType: StepType;
  /**
   * Node-level cap checkpoints for the step (days). Sourced from
   * `node.stats` -- the same numbers the step-card detail page renders,
   * so the lever speaks the same language as the rest of the app.
   */
  median: number;
  p25: number;
  p75: number;
  p95: number;
  max: number;
  /** Node-level mean (days), used for ranking/readout context only. */
  mean: number;
  bindingShare: number;
  meanSlack: number | null;
  /** Mean E2E headroom in days before another chain becomes binding. */
  nextBottleneckDays: number | null;
  /**
   * Top-k candidate chains that become binding once this step's
   * headroom is consumed. Populated for upstream steps only; null for
   * serial post-production steps and when no data is available.
   */
  nextBottleneckChains: NextBottleneckChain[] | null;
  /** Expected E2E days saved per day of reducible tail mass (0..1). */
  expectedMarginalPerDay: number;
  /** Currency unit for this step's cost saving, if known. */
  currency: string | null;
  /** False when this historical step is not reachable in the current recipe. */
  inCurrentRecipe: boolean | null;
}

export type CapCheckpointKey =
  | "zero"
  | "p25"
  | "median"
  | "p75"
  | "p95"
  | "max";

export interface CapCheckpoint {
  key: CapCheckpointKey;
  label: string;
  capDays: number;
}

export interface SimulationResult {
  baselineMean: number | null;
  simulatedMean: number | null;
  baselineMedian: number | null;
  simulatedMedian: number | null;
  daysSaved: number;
  pctReduction: number;
  batchesAffected: number;
  batchesTotal: number;
  costSavingPeriod: number | null;
  costSavingAnnualised: number | null;
  costCurrency: string | null;
  /** Per-batch-mean re-segmented stages for the dashed mean bar. */
  simulatedStagesMean: PipelineStage[];
  /** Per-batch-median re-segmented stages for the dashed median bar. */
  simulatedStagesMedian: PipelineStage[];
}

const EXCLUDED_LEVER_TYPES = new Set<StepType>([
  "procurement",
  "raw_material_dwell",
]);

/**
 * The four pipeline-bar segments. Each one corresponds to:
 *  - a `seg_*` field on every `BatchRow` (per-batch baseline duration),
 *  - a `PipelineStage.type` rendered in the waterfall,
 *  - a group of `StepType`s that act as levers for that segment.
 *
 * The Overview page lifts an `activeSegments: Set<SegmentId>` so that
 * toggling a chip in the legend flows through to the bar totals, KPI
 * tiles, dashed simulated bars and the lever list in one place.
 */
export type SegmentId = "procurement" | "production" | "qa_hold" | "transit";

export const ALL_SEGMENTS: readonly SegmentId[] = [
  "procurement",
  "production",
  "qa_hold",
  "transit",
];

const CAP_INACTIVE_EPSILON = 0.5;

function cleanCheckpointValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function capCheckpointsFor(lever: LeverDefinition): CapCheckpoint[] {
  const checkpoints: CapCheckpoint[] = [
    { key: "zero", label: "Exclude", capDays: 0 },
    { key: "p25", label: "P25", capDays: lever.p25 },
    { key: "median", label: "Median", capDays: lever.median },
    { key: "p75", label: "P75", capDays: lever.p75 },
    { key: "p95", label: "P95", capDays: lever.p95 },
    { key: "max", label: "Max", capDays: lever.max },
  ];

  return checkpoints
    .map(
      (checkpoint): CapCheckpoint => ({
        ...checkpoint,
        capDays: Math.max(0, checkpoint.capDays),
      }),
    )
    .filter(
      (checkpoint) => checkpoint.key === "zero" || checkpoint.capDays > 0,
    );
}

export function defaultCapDays(lever: LeverDefinition): number {
  return Math.max(0, lever.max);
}

export function isCapActive(
  lever: LeverDefinition,
  capDays: number | null | undefined,
): boolean {
  if (capDays == null || !Number.isFinite(capDays)) {
    return false;
  }
  return capDays < defaultCapDays(lever) - CAP_INACTIVE_EPSILON;
}

export function capDuration(
  duration: number,
  capDays: number | null | undefined,
): number {
  if (capDays == null || !Number.isFinite(capDays) || capDays < 0) {
    return duration;
  }
  return Math.min(duration, capDays);
}

export function meanObservedCapReduction(
  node: GraphNode | undefined,
  capDays: number | null | undefined,
): number {
  if (!node || capDays == null || !Number.isFinite(capDays) || capDays < 0) {
    return 0;
  }
  const vals = (node.observations ?? [])
    .map((observation) => observation.value)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    );
  if (vals.length === 0) {
    return 0;
  }
  return (
    vals.reduce((sum, value) => sum + Math.max(0, value - capDays), 0) /
    vals.length
  );
}

export function observedCapSavingFraction(
  node: GraphNode,
  capDays: number,
): number | null {
  const vals = (node.observations ?? [])
    .map((observation) => observation.value)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    );
  const total = vals.reduce((sum, value) => sum + value, 0);
  if (vals.length === 0 || total <= 0) {
    return null;
  }
  const saved = vals.reduce(
    (sum, value) => sum + Math.max(0, value - capDays),
    0,
  );
  return Math.min(1, Math.max(0, saved / total));
}

/**
 * Map a lever's `StepType` to the pipeline segment it lives in.
 *
 * Anchored to the segment-to-`seg_*` mapping in `STAGE_DEFS` below:
 *  - procurement / raw-material dwell                           -> "procurement"
 *  - upstream production / intermediate dwell / FG production   -> "production"
 *  - QA hold                                                    -> "qa_hold"
 *  - post-QA dwell / QA ship / transit / destination dwell      -> "transit"
 *
 * Procurement-segment levers don't currently surface (the simulator
 * excludes them via `EXCLUDED_LEVER_TYPES`), but mapping them here keeps
 * the legend, segment toggle and lever filter consistent.
 */
export function leverSegmentFor(stepType: StepType): SegmentId {
  switch (stepType) {
    case "procurement":
    case "raw_material_dwell":
      return "procurement";
    case "production":
    case "intermediate_dwell":
      return "production";
    case "qa_hold":
      return "qa_hold";
    case "post_qa_ship":
    case "transit":
    case "destination_dwell":
      return "transit";
  }
}

function bindingFor(
  node: GraphNode,
  routeCode: string | null,
): BindingScore | null {
  const map = node.binding;
  if (!map) {
    return null;
  }
  if (routeCode && map[routeCode]) {
    return map[routeCode];
  }
  return map.all ?? null;
}

/**
 * Rank candidate levers and return the top-N, filtered to the active
 * route. Excludes procurement and raw-material dwell -- those steps sit
 * before "Production Start" and are out of scope for the simulator.
 *
 * Lever checkpoint stats (max/P95/P75/median/P25) come from `node.stats`
 * so the lever always reads the same numbers the step-card detail page
 * displays. The simulator's per-batch math operates on the full
 * `step_contributions` payload regardless of the displayed reference --
 * `node.stats` is just used for cap labels and checkpoint values.
 *
 * Sort order: bindingShare desc, nextBottleneckDays desc, median desc.
 * This surfaces the steps that bind most often first, then breaks ties
 * on the headroom available before another chain becomes binding.
 */
export function selectTopLevers(
  nodes: GraphNode[],
  batches: BatchRow[],
  routeCode: string | null,
  opts: { maxN?: number; activeSegments?: Set<SegmentId> } = {},
): LeverDefinition[] {
  const maxN = opts.maxN ?? 5;
  const activeSegments = opts.activeSegments;

  const routeBatches = routeCode
    ? batches.filter((batch) => batch.route === routeCode)
    : batches;

  // Track which steps the active route actually touches, so we don't
  // surface levers for steps that never appear in a batch's chain or
  // post-production map. (E.g. an intermediate that only exists on the
  // direct-shipping route should not show up when a hub route is selected.)
  const knownStepIds = new Set<string>();
  for (const batch of routeBatches) {
    const sc = batch.step_contributions;
    if (!sc) {
      continue;
    }
    for (const chain of sc.upstream_chains) {
      for (const step of chain.steps) {
        knownStepIds.add(step.step_id);
      }
    }
    for (const key of Object.keys(sc.post_production)) {
      knownStepIds.add(key);
    }
  }

  const candidates: LeverDefinition[] = [];
  for (const node of nodes) {
    if (!knownStepIds.has(node.id)) {
      continue;
    }
    if (EXCLUDED_LEVER_TYPES.has(node.type)) {
      continue;
    }
    // Drop levers whose segment was toggled off in the legend. When no
    // set is passed, all segments are implicitly active.
    if (activeSegments && !activeSegments.has(leverSegmentFor(node.type))) {
      continue;
    }
    const binding = bindingFor(node, routeCode);
    if (!binding) {
      continue;
    }
    const stats = node.stats;
    const nodeMedian = cleanCheckpointValue(stats.median);
    const nodeP25 = cleanCheckpointValue(stats.p25);
    const nodeP75 = cleanCheckpointValue(stats.p75);
    const nodeP95 = cleanCheckpointValue(stats.p95);
    const nodeMean = cleanCheckpointValue(stats.mean);
    const nodeMax = Math.max(
      cleanCheckpointValue(stats.max),
      nodeP95,
      nodeP75,
      nodeMedian,
      nodeP25,
      nodeMean,
    );
    const nextBottleneck = binding.next_bottleneck_days ?? 0;
    // Skip steps with no useful duration to cap and no headroom to chew
    // through -- there's nothing meaningful for a lever to do.
    if (
      nodeMax <= 0 &&
      nodeMedian <= 0 &&
      nodeMean <= 0 &&
      nextBottleneck <= 0
    ) {
      continue;
    }

    candidates.push({
      stepId: node.id,
      label: node.label,
      stepType: node.type,
      median: nodeMedian,
      p25: nodeP25,
      p75: nodeP75,
      p95: nodeP95,
      max: nodeMax,
      mean: nodeMean,
      bindingShare: binding.binding_share,
      meanSlack: binding.mean_slack,
      nextBottleneckDays: binding.next_bottleneck_days,
      nextBottleneckChains: binding.next_bottleneck_chains ?? null,
      expectedMarginalPerDay: binding.expected_marginal_per_day,
      currency: node.cost?.currency ?? null,
      inCurrentRecipe: node.in_current_recipe ?? null,
    });
  }

  candidates.sort((left, right) => {
    const aStale = left.inCurrentRecipe === false ? 1 : 0;
    const bStale = right.inCurrentRecipe === false ? 1 : 0;
    if (aStale !== bStale) {
      return aStale - bStale;
    }
    if (right.bindingShare !== left.bindingShare) {
      return right.bindingShare - left.bindingShare;
    }
    const aN = left.nextBottleneckDays ?? 0;
    const bN = right.nextBottleneckDays ?? 0;
    if (bN !== aN) {
      return bN - aN;
    }
    return right.median - left.median;
  });
  return candidates.slice(0, maxN);
}

/** Confidence threshold for "single next-binding chain" presentation. */
const NEXT_CHAIN_CONFIDENT_THRESHOLD = 0.7;

/**
 * Format the identity of the next-binding chain(s) for surfacing in the
 * lever caption and the "beyond next bottleneck" caveat.
 *
 * - When the top candidate has >=70% share, render confidently with the
 *   single chain label.
 * - Otherwise, render the top two with their shares so the user
 *   understands the next bottleneck depends on the batch.
 * - Returns `null` when no chain data is available -- callers should
 *   fall back to the days-only readout.
 *
 * Each chain `label` is the leaf step's full label (e.g.
 * "Intermediate Dwell: <material>"); we strip the type-prefix here
 * so the readout stays compact.
 */

function stripChainLabelPrefix(label: string): string {
  // Backend emits leaf-step labels like "Intermediate Dwell: <material>"
  // or "Production: <material>". Strip the type prefix so the chain identity
  // (the material) reads cleanly in compact contexts.
  const idx = label.indexOf(": ");
  if (idx === -1) {
    return label;
  }
  return label.slice(idx + 2);
}
export function formatNextBottleneck(
  chains: NextBottleneckChain[] | null | undefined,
): {
  mode: "single" | "mixed";
  text: string;
  entries: Array<{ label: string; share: number }>;
} | null {
  if (!chains || chains.length === 0) {
    return null;
  }
  const stripped = chains.map((chain) => ({
    label: stripChainLabelPrefix(chain.label),
    share: chain.share,
  }));
  const first = stripped[0];
  if (!first) {
    return null;
  }
  if (first.share >= NEXT_CHAIN_CONFIDENT_THRESHOLD) {
    return { mode: "single", text: first.label, entries: [first] };
  }
  const top2 = stripped.slice(0, 2);
  const text = top2
    .map((event) => `${event.label} ${Math.round(event.share * 100)}%`)
    .join(" / ");
  return { mode: "mixed", text, entries: top2 };
}

interface SimulatedBatch {
  /** Baseline upstream span = max(chain.total_days). */
  upstreamBaseline: number;
  /** Simulated upstream span = max(chain.total_days_after_caps). */
  upstreamSimulated: number;
  /** Reduction credited to the prodstart->prodfinish segment from upstream. */
  upstreamReduction: number;
  fgProdBaseline: number;
  fgProdSimulated: number;
  qaHoldBaseline: number;
  qaHoldSimulated: number;
  postQaBaseline: number;
  postQaSimulated: number;
}

/**
 * Apply cap levers to a single batch's chain + post-prod structure.
 * `caps[stepId]` is an absolute duration ceiling; every occurrence above
 * that ceiling is clipped down while shorter occurrences are unchanged.
 * The simulator re-computes each chain's total as the sum of capped step
 * durations; the new longest chain drives the upstream reduction credited
 * to the production segment.
 */
function simulateBatch(
  contributions: StepContributions,
  anchors: { fgProdId: string | null; qaHoldId: string | null },
  caps: Record<string, number>,
): SimulatedBatch {
  let upstreamBaseline = 0;
  let upstreamSimulated = 0;
  for (const chain of contributions.upstream_chains) {
    const baseline = chain.total_days;
    if (baseline > upstreamBaseline) {
      upstreamBaseline = baseline;
    }
    let simulated = 0;
    for (const step of chain.steps) {
      simulated += capDuration(step.duration, caps[step.step_id]);
    }
    if (simulated > upstreamSimulated) {
      upstreamSimulated = simulated;
    }
  }
  const upstreamReduction = Math.max(0, upstreamBaseline - upstreamSimulated);

  const post = contributions.post_production;

  const fgProdBaseline = anchors.fgProdId ? (post[anchors.fgProdId] ?? 0) : 0;
  const fgProdSimulated = anchors.fgProdId
    ? capDuration(fgProdBaseline, caps[anchors.fgProdId])
    : fgProdBaseline;

  const qaHoldBaseline = anchors.qaHoldId ? (post[anchors.qaHoldId] ?? 0) : 0;
  const qaHoldSimulated = anchors.qaHoldId
    ? capDuration(qaHoldBaseline, caps[anchors.qaHoldId])
    : qaHoldBaseline;

  let postQaBaseline = 0;
  let postQaSimulated = 0;
  for (const [stepId, days] of Object.entries(post)) {
    if (stepId === anchors.fgProdId || stepId === anchors.qaHoldId) {
      continue;
    }
    postQaBaseline += days;
    postQaSimulated += capDuration(days, caps[stepId]);
  }

  return {
    upstreamBaseline,
    upstreamSimulated,
    upstreamReduction,
    fgProdBaseline,
    fgProdSimulated,
    qaHoldBaseline,
    qaHoldSimulated,
    postQaBaseline,
    postQaSimulated,
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) {
    return null;
  }
  const mid = Math.floor(sortedAsc.length / 2);
  const upper = sortedAsc[mid];
  if (upper === undefined) {
    throw new Error("Median index was outside the provided series");
  }
  if (sortedAsc.length % 2 === 1) {
    return upper;
  }
  const lower = sortedAsc[mid - 1];
  if (lower === undefined) {
    throw new Error("Median lower index was outside the provided series");
  }
  return (lower + upper) / 2;
}

interface CostAssumptions {
  waccRate: number;
  storageCost: number;
}

/** Sum period cost saving across all active cap levers. */
function computeCostSaving(
  nodes: GraphNode[],
  caps: Record<string, number>,
  assumptions: CostAssumptions,
): { period: number | null; currency: string | null } {
  let totalSaving = 0;
  let saw = false;
  let currency: string | null = null;
  for (const node of nodes) {
    const capDays = caps[node.id];
    if (capDays == null || capDays < 0) {
      continue;
    }
    const fraction = observedCapSavingFraction(node, capDays);
    if (fraction == null || fraction <= 0) {
      continue;
    }
    const unitPrice = node.cost?.unit_price ?? null;
    if (unitPrice == null) {
      continue;
    }
    const stepActual = computePeriodCost(
      node.monthly,
      unitPrice,
      assumptions.waccRate,
      assumptions.storageCost,
    );
    if (stepActual <= 0) {
      continue;
    }
    totalSaving += stepActual * fraction;
    saw = true;
    currency ??= node.cost?.currency ?? null;
  }
  return { period: saw ? totalSaving : null, currency };
}

interface StageDef {
  id: string;
  label: string;
  type: StepType;
  /** Which segment chip in the legend gates this stage on / off. */
  segment: SegmentId;
}

const STAGE_DEFS: StageDef[] = [
  {
    id: "seg_proc_to_prodstart",
    label: "Procurement \u2192 Production Start",
    type: "procurement",
    segment: "procurement",
  },
  {
    id: "seg_prodstart_to_prodfinish",
    label: "Production Start \u2192 Production Finish",
    type: "production",
    segment: "production",
  },
  {
    id: "seg_prodfinish_to_qa",
    label: "Production Finish \u2192 QA Release",
    type: "qa_hold",
    segment: "qa_hold",
  },
  {
    id: "seg_qa_to_customer",
    label: "QA Release \u2192 Customer",
    type: "transit",
    segment: "transit",
  },
];

function buildStages(
  procToPS: number,
  prodStartToFinish: number,
  prodFinishToQa: number,
  qaToCustomer: number,
  activeSegments?: Set<SegmentId>,
): PipelineStage[] {
  // Zero-out values for segments that the user has toggled off so the
  // dashed simulated bar matches the baseline's segment composition.
  const raw = [procToPS, prodStartToFinish, prodFinishToQa, qaToCustomer];
  const values = raw.map((value, index) => {
    const stage = STAGE_DEFS[index];
    if (!stage) {
      throw new Error("Pipeline stage definition missing");
    }
    return activeSegments && !activeSegments.has(stage.segment) ? 0 : value;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  return STAGE_DEFS.map((def, index) => {
    const value = values[index];
    if (value === undefined) {
      throw new Error("Pipeline stage value missing");
    }

    return {
      id: def.id,
      label: def.label,
      type: def.type,
      mean: value,
      median: value,
      pct_of_total: total > 0 ? (value / total) * 100 : 0,
    };
  });
}

export function aggregateSimulation(
  nodes: GraphNode[],
  batches: BatchRow[],
  capLevers: Record<string, number>,
  leverDefs: LeverDefinition[],
  routeCode: string | null,
  assumptions: CostAssumptions,
  options: {
    windowMonths?: number;
    activeSegments?: Set<SegmentId>;
    excludeOutliers?: boolean;
  } = {},
): SimulationResult {
  const windowMonths = options.windowMonths ?? 12;
  const activeSegments = options.activeSegments;
  const excludeOutliers = options.excludeOutliers ?? false;
  const isActive = (step: SegmentId) =>
    !activeSegments || activeSegments.has(step);
  const routeBatches = routeCode
    ? batches.filter((batch) => batch.route === routeCode)
    : batches;

  // When outliers are excluded, trim each segment with the same Tukey 1.5x IQR
  // rule the waterfall uses (recompute-batch-timelines.segStats), so the KPI
  // baseline/simulated totals stay consistent with the waterfall bars instead
  // of including points the bars dropped.
  const segFence = (
    pick: (b: BatchRow) => number | null | undefined,
  ): IqrFences | null => {
    const vals = routeBatches
      .map(pick)
      .filter(
        (value): value is number =>
          typeof value === "number" && value >= 0 && value <= 730,
      );
    return computeIqrFences(vals);
  };
  const fences = excludeOutliers
    ? {
        procToPS: segFence((batch) => batch.seg_proc_to_prodstart),
        prodStartToFinish: segFence(
          (batch) => batch.seg_prodstart_to_prodfinish,
        ),
        prodFinishToQa: segFence((batch) => batch.seg_prodfinish_to_qa),
        qaToCustomer: segFence((batch) => batch.seg_qa_to_customer),
      }
    : null;
  const within = (
    value: number,
    fraction: IqrFences | null | undefined,
  ): boolean =>
    !fraction || (value >= fraction.lower && value <= fraction.upper);

  // The `capLevers` Record is keyed on stepId with an absolute cap in days.
  // Missing entries, entries for hidden levers, and caps at/above the step max
  // are treated as "uncapped". The result is the active cap map fed into
  // simulateBatch.
  const leverById = new Map<string, LeverDefinition>();
  for (const line of leverDefs) {
    leverById.set(line.stepId, line);
  }
  const activeCaps: Record<string, number> = {};
  for (const [stepId, capDays] of Object.entries(capLevers)) {
    const lever = leverById.get(stepId);
    if (!lever) {
      continue;
    }
    if (isCapActive(lever, capDays)) {
      activeCaps[stepId] = capDays;
    }
  }

  // Identify the FG production and QA-hold anchors from any batch's
  // post_production keys. They follow predictable conventions
  // (`prod_duration_<slug>` and `prod_to_qa_<plant>`) but reading them off
  // the data avoids hardcoding.
  let fgProdId: string | null = null;
  let qaHoldId: string | null = null;
  for (const batch of routeBatches) {
    const sc = batch.step_contributions;
    if (!sc) {
      continue;
    }
    for (const key of Object.keys(sc.post_production)) {
      if (fgProdId == null && key.startsWith("prod_duration_")) {
        fgProdId = key;
      }
      if (qaHoldId == null && key.startsWith("prod_to_qa_")) {
        qaHoldId = key;
      }
    }
    if (fgProdId && qaHoldId) {
      break;
    }
  }
  const anchors = { fgProdId, qaHoldId };

  const baselineTotals: number[] = [];
  const simulatedTotals: number[] = [];
  // Per-segment buckets only collect rows where the batch's baseline for
  // that segment is non-null and within the outlier band -- matching the
  // baseline waterfall's segStats semantics so the dashed simulated bars
  // overlay cleanly when no levers are active.
  const segs = {
    procToPS: [] as number[],
    prodStartToFinish: [] as number[],
    prodFinishToQa: [] as number[],
    qaToCustomer: [] as number[],
  };
  let batchesAffected = 0;

  const inRange = (value: number | undefined | null): value is number =>
    value != null && value >= 0 && value <= 730;

  for (const batch of routeBatches) {
    const sc = batch.step_contributions;
    if (!sc) {
      continue;
    }

    const sim = simulateBatch(sc, anchors, activeCaps);

    const procToPSRaw = batch.seg_proc_to_prodstart;
    const prodStartToFinishRaw = batch.seg_prodstart_to_prodfinish;
    const prodFinishToQaRaw = batch.seg_prodfinish_to_qa;
    const qaToCustomerRaw = batch.seg_qa_to_customer;

    const fgProdReduction = Math.max(
      0,
      sim.fgProdBaseline - sim.fgProdSimulated,
    );
    const qaHoldReduction = Math.max(
      0,
      sim.qaHoldBaseline - sim.qaHoldSimulated,
    );
    const postQaReduction = Math.max(
      0,
      sim.postQaBaseline - sim.postQaSimulated,
    );
    const prodSegmentReduction = sim.upstreamReduction + fgProdReduction;

    let baselineTotal = 0;
    let simulatedTotal = 0;
    // Skip a segment's contribution when its legend chip is toggled off. The
    // per-segment validity band (`inRange`) and, when active, the Tukey IQR
    // fence (`within`) both apply per-segment, so a batch can still contribute
    // its other valid segments even when one is excluded.
    if (
      isActive("procurement") &&
      inRange(procToPSRaw) &&
      within(procToPSRaw, fences?.procToPS)
    ) {
      segs.procToPS.push(procToPSRaw);
      baselineTotal += procToPSRaw;
      simulatedTotal += procToPSRaw;
    }
    if (
      isActive("production") &&
      inRange(prodStartToFinishRaw) &&
      within(prodStartToFinishRaw, fences?.prodStartToFinish)
    ) {
      const sim2 = Math.max(0, prodStartToFinishRaw - prodSegmentReduction);
      segs.prodStartToFinish.push(sim2);
      baselineTotal += prodStartToFinishRaw;
      simulatedTotal += sim2;
    }
    if (
      isActive("qa_hold") &&
      inRange(prodFinishToQaRaw) &&
      within(prodFinishToQaRaw, fences?.prodFinishToQa)
    ) {
      const sim2 = Math.max(0, prodFinishToQaRaw - qaHoldReduction);
      segs.prodFinishToQa.push(sim2);
      baselineTotal += prodFinishToQaRaw;
      simulatedTotal += sim2;
    }
    if (
      isActive("transit") &&
      inRange(qaToCustomerRaw) &&
      within(qaToCustomerRaw, fences?.qaToCustomer)
    ) {
      const sim2 = Math.max(0, qaToCustomerRaw - postQaReduction);
      segs.qaToCustomer.push(sim2);
      baselineTotal += qaToCustomerRaw;
      simulatedTotal += sim2;
    }

    if (baselineTotal > 0) {
      baselineTotals.push(baselineTotal);
      simulatedTotals.push(simulatedTotal);
      if (simulatedTotal < baselineTotal - 0.5) {
        batchesAffected += 1;
      }
    }
  }

  const sortedBaseline = [...baselineTotals].sort(
    (left, right) => left - right,
  );
  const sortedSimulated = [...simulatedTotals].sort(
    (left, right) => left - right,
  );

  const baselineMean = mean(baselineTotals);
  const simulatedMean = mean(simulatedTotals);
  const daysSaved =
    baselineMean != null && simulatedMean != null
      ? Math.max(0, baselineMean - simulatedMean)
      : 0;
  const pctReduction =
    baselineMean && baselineMean > 0 ? daysSaved / baselineMean : 0;

  const cost = computeCostSaving(nodes, activeCaps, assumptions);
  const costSavingPeriod = cost.period;
  const costSavingAnnualised =
    costSavingPeriod != null ? costSavingPeriod * (12 / windowMonths) : null;

  const sortedSegMedian = (vals: number[]) =>
    [...vals].sort((left, right) => left - right);
  const simulatedStagesMean = buildStages(
    mean(segs.procToPS) ?? 0,
    mean(segs.prodStartToFinish) ?? 0,
    mean(segs.prodFinishToQa) ?? 0,
    mean(segs.qaToCustomer) ?? 0,
    activeSegments,
  );
  const simulatedStagesMedian = buildStages(
    median(sortedSegMedian(segs.procToPS)) ?? 0,
    median(sortedSegMedian(segs.prodStartToFinish)) ?? 0,
    median(sortedSegMedian(segs.prodFinishToQa)) ?? 0,
    median(sortedSegMedian(segs.qaToCustomer)) ?? 0,
    activeSegments,
  );

  return {
    baselineMean,
    simulatedMean,
    baselineMedian: median(sortedBaseline),
    simulatedMedian: median(sortedSimulated),
    daysSaved,
    pctReduction,
    batchesAffected,
    batchesTotal: routeBatches.filter(
      (batch) => batch.step_contributions != null,
    ).length,
    costSavingPeriod,
    costSavingAnnualised,
    costCurrency: cost.currency,
    simulatedStagesMean,
    simulatedStagesMedian,
  };
}
