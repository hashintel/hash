import { isProductSpecificType } from "../../shared/categories";
import {
  computeMonthlyCost,
  computePeriodCost,
  costRatePerKgDay,
  formatNumber,
} from "../../shared/cost";
import { computeTrend, computePeriodDeltas } from "../../shared/period-trends";
import { summarizeProcurementPlanning } from "../../shared/procurement-planning";
import { percentileOf } from "../../shared/stats";
import { recomputeSupplierBlock } from "../../shared/supplier-otif";
import {
  type TimeRange,
  cutoffForRange,
  rangeMonths,
} from "../../shared/time-range";

import type {
  BindingScore,
  GraphNode,
  MonthlyBucket,
  Observation,
  SiteNode,
  StepDetail,
  StepStats,
  StepType,
} from "../../shared/types";

export { computeTrend };
import {
  PLAYBOOKS,
  diagnosisFor,
  shapeSignals,
  type PlaybookContext,
  type RecommendedAction,
} from "./recommendation-playbook";

export type OpportunityType = "dwell" | "planning";
export type OpportunityBriefSourceKind =
  | "dwell_cost"
  | "planning_over"
  | "planning_under"
  | null;

export interface CostAssumptions {
  waccRate: number;
  storageCost: number;
}

/** A single product's own (pre-dedup) graph node for the brief's step/material. */
export interface ProductNodeRef {
  productId: string;
  productName: string;
  node: GraphNode;
}

/**
 * Extra context for the dwell brief that the deduped step detail cannot carry:
 * the resolved site node (for E2E binding leverage) and every consuming
 * product's own node (for per-product BOM membership). Both are optional so the
 * builder still works from step detail alone (e.g. in unit tests).
 */
export interface DwellBriefContext {
  siteNode?: SiteNode | null;
  productNodes?: ProductNodeRef[];
}

export interface OpportunityTrend {
  pctChange: number | null;
  currentValue: number | null;
  previousValue: number | null;
  currentN: number;
  previousN: number;
  direction: "improving" | "worsening" | "flat" | "unknown";
}

export interface EvidenceFlag {
  severity: "info" | "warning";
  label: string;
  detail: string;
}

export interface OpportunityTrigger {
  label: string;
  reason: string;
  primaryMetric: string;
}

export interface OpportunityConfidence {
  label: "High" | "Warning" | "Low";
  caveats: string[];
  explanation: string;
}

/** End-to-end leverage of reducing this step, from the node's binding score. */
export interface E2ELeverage {
  bindingSharePct: number;
  expectedMarginalPerDay: number;
  nextBottleneckDays: number | null;
  nextBottleneckLabel: string | null;
}

/** Per-consuming-material breakdown of a shared material's dwell impact. */
export interface PerProductImpactRow {
  key: string;
  label: string;
  kgDays: number;
  periodCost: number | null;
  sharePct: number;
  events: number;
  /**
   * Whether this consuming material still lists the step material in its current
   * BOM. False => off-recipe (badge it); null => no current BOM extract to judge.
   */
  inCurrentRecipe: boolean | null;
}

/** Whether a consuming product still uses this material in its current recipe. */
export interface RecipeMembership {
  productName: string;
  inCurrentRecipe: boolean | null;
}

/** A single high-leverage evidence row surfaced inline in the brief. */
export interface BriefEvidenceRow {
  label: string;
  date: string | null;
  days: number | null;
  kgDays: number | null;
}

/** Compact per-vendor OTIF line for the procurement brief. */
export interface SupplierBriefVendor {
  name: string;
  otifPct: number | null;
  meanDaysLateAll: number | null;
  ge7dPct: number | null;
  nLines: number;
}

/** Materialised supplier OTIF subset rendered in procurement briefs. */
export interface SupplierBriefSummary {
  primaryVendorName: string | null;
  vendors: SupplierBriefVendor[];
  worstEvents: Array<{
    vendorName: string | null;
    materialName: string | null;
    poNumber: string | null;
    daysLate: number;
    date: string | null;
  }>;
  nLines: number;
  coveragePct: number | null;
  dataQualityNote: string | null;
}

/** Plain-language yield / consumption notes for production steps. */
export interface ProductionInsight {
  yield: string | null;
  consumption: string | null;
}

/**
 * Receipt -> first-consumption dwell for lot-based dwell stages (raw material
 * and intermediate). The first draw off each received batch isolates the
 * avoidable "ordered too early" wait from the structural depletion tail (later
 * tranches that are inevitable once you buy in lots), so a large first-use dwell
 * is a clean signal that ordering/scheduling runs ahead of first need.
 */
export interface FirstUseDwellSummary {
  medianDays: number;
  p95Days: number;
  meanDays: number;
  nBatches: number;
  /** Event-level median dwell across all consumption events, for comparison. */
  overallMedianDays: number | null;
  /** Structural depletion portion (overall median - first-use median), >= 0. */
  structuralDays: number | null;
  /** First-use dwell as a share of overall median dwell (%). */
  firstUseSharePct: number | null;
  note: string;
}

export interface DwellScenario {
  label: string;
  targetDays: number;
  reductionPct: number;
  periodSaving: number | null;
  annualizedSaving: number | null;
  reducedPeriodCost: number | null;
  rationale: string;
  approximate: boolean;
}

export interface DwellOpportunityBrief {
  kind: "dwell";
  stepType: StepType;
  opportunityTrigger: OpportunityTrigger;
  confidence: OpportunityConfidence;
  periodCost: number | null;
  annualizedCost: number | null;
  currency: string | null;
  scenarios: DwellScenario[];
  diagnosis: string[];
  evidenceFlags: EvidenceFlag[];
  trend: OpportunityTrend;
  distributionInsight: string | null;
  highestCostMonth: { month: string; cost: number; events: number } | null;
  recommendationSummary: string;
  recommendedActions: RecommendedAction[];
  e2eLeverage: E2ELeverage | null;
  perProductImpact: PerProductImpactRow[];
  recipeMembership: RecipeMembership[];
  outOfCurrentRecipe: boolean;
  supplier: SupplierBriefSummary | null;
  topEvidence: BriefEvidenceRow[];
  provenance: string | null;
  normalizationNote: string | null;
  productionInsight: ProductionInsight | null;
  clustering: string | null;
  tailTrendNote: string | null;
  firstUseDwell: FirstUseDwellSummary | null;
}

export interface PlanningCalibrationImpact {
  label: string;
  days: number | null;
  bufferDaysVsPlan: number | null;
  pctExceeding: number | null;
  description: string;
}

export interface PlanningOpportunityBrief {
  kind: "planning";
  stepType: StepType;
  opportunityTrigger: OpportunityTrigger;
  confidence: OpportunityConfidence;
  currentPlanDays: number | null;
  p95Days: number | null;
  medianDays: number | null;
  meanDays: number | null;
  serviceLevelOptions: Array<{
    label: string;
    days: number | null;
    description: string;
  }>;
  medianDeviationPct: number | null;
  meanDeviationPct: number | null;
  p95DeviationPct: number | null;
  pctExceedingPlan: number | null;
  nExceedingPlan: number | null;
  calibrationDirection: "increase" | "tighten" | "review";
  calibrationImpact: PlanningCalibrationImpact[];
  diagnosis: string[];
  evidenceFlags: EvidenceFlag[];
  trend: OpportunityTrend;
  recommendationSummary: string;
  recommendedActions: RecommendedAction[];
  supplier: SupplierBriefSummary | null;
  topEvidence: BriefEvidenceRow[];
  provenance: string | null;
  normalizationNote: string | null;
  productionInsight: ProductionInsight | null;
  clustering: string | null;
  tailTrendNote: string | null;
}

const LOW_SAMPLE_N = 10;
const WARNING_SAMPLE_N = 30;
const STALE_OBSERVATION_DAYS = 60;

export function buildOpportunityBackLink(
  siteId: string,
  search: URLSearchParams | null = null,
  fallback = "/supply-chain",
): string {
  const path = siteId ? `/supply-chain/site/${siteId}` : fallback;
  if (!search) {
    return path;
  }
  const carry = new URLSearchParams();
  const cat = search.get("cat");
  if (cat) {
    carry.set("cat", cat);
  }
  const range = search.get("range");
  if (range) {
    carry.set("range", range);
  }
  const query = carry.toString();
  return query ? `${path}?${query}` : path;
}

export function firstProductForNode(
  node: SiteNode,
  requestedProductId?: string,
): string {
  if (
    isProductSpecificType(node.type) &&
    requestedProductId &&
    node.products.some((product) => product.id === requestedProductId)
  ) {
    return requestedProductId;
  }
  return node.products[0]?.id ?? requestedProductId ?? "";
}

function positiveOrZero(value: number | null | undefined): number {
  return value == null ? 0 : Math.max(0, value);
}

function cappedReductionPct(
  observations: Observation[],
  capDays: number,
  stats: StepStats,
): number {
  const values = observations
    .map((observation) => observation.value)
    .filter((value) => value > 0);
  if (values.length > 0) {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return 0;
    }
    const removable = values.reduce(
      (sum, value) => sum + Math.max(0, value - capDays),
      0,
    );
    return Math.max(0, Math.min(1, removable / total));
  }
  const mean = positiveOrZero(stats.mean);
  if (mean <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (mean - capDays) / mean));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSignedPct(value: number | null): string {
  if (value == null) {
    return "–";
  }
  return `${value > 0 ? "+" : ""}${formatNumber(value, { maximumFractionDigits: 0 })}%`;
}

function trendDiagnosis(
  trend: OpportunityTrend,
  range: TimeRange,
  p95Over: boolean,
  p95Under: boolean,
): string {
  if (
    trend.pctChange == null ||
    trend.currentValue == null ||
    trend.previousValue == null
  ) {
    return `No comparable previous-period trend is available for the ${range} window.`;
  }
  const direction =
    trend.pctChange > 0
      ? "worsening"
      : trend.pctChange < 0
        ? "improving"
        : "flat";
  const comparison = `${formatNumber(trend.currentValue, { maximumFractionDigits: 1 })} days currently vs ${formatNumber(trend.previousValue, { maximumFractionDigits: 1 })} days in the previous comparable ${range} window (${formatSignedPct(trend.pctChange)})`;
  if (direction === "improving" && p95Over) {
    return `Trend is improving (${comparison}), but the current high-percentile lead time is still above plan; confirm the gain is structural before choosing how far to increase the planning parameter.`;
  }
  if (direction === "worsening" && p95Under) {
    return `Trend is worsening (${comparison}), so treat the apparent conservative planning buffer cautiously before tightening it.`;
  }
  if (direction === "improving") {
    return `Trend is improving (${comparison}); validate whether the improvement is structural before locking in tighter assumptions.`;
  }
  if (direction === "worsening") {
    return `Trend is worsening (${comparison}); the current parameter may need more protection if the change persists.`;
  }
  return `Trend is broadly flat (${comparison}); use the distribution statistics as the main calibration signal.`;
}

function latestObservationDate(observations: Observation[]): Date | null {
  if (observations.length === 0) {
    return null;
  }
  return (
    observations
      .map((observation) => new Date(observation.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
}

function formatCostForText(
  value: number | null,
  currency: string | null,
): string {
  if (value == null) {
    return "unknown";
  }
  return `${currency ? `${currency} ` : ""}${formatNumber(value, { compact: true, maximumFractionDigits: 1 })}`;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function toNumberOrNull(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") {
    return null;
  }
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : null;
}

function pickFirstKey(keys: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (keys.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildFirstUseNote(
  medianDays: number,
  overallMedianDays: number | null,
  structuralDays: number | null,
  firstUseSharePct: number | null,
): string {
  const median = formatNumber(medianDays, { maximumFractionDigits: 1 });
  if (
    overallMedianDays == null ||
    structuralDays == null ||
    firstUseSharePct == null
  ) {
    return `The first draw off a received batch has a median wait of ${median}d before it is consumed.`;
  }
  const overall = formatNumber(overallMedianDays, { maximumFractionDigits: 1 });
  if (medianDays > overallMedianDays) {
    return `The first draw off each batch has a median wait of ${median}d, above the ${overall}d event-level median dwell. This can happen when the event-level median is weighted by many later consumption rows from faster-turning batches, while first-use counts each batch once. Treat this as an early ordering or scheduling signal rather than a share of total dwell.`;
  }
  const structural = formatNumber(structuralDays, { maximumFractionDigits: 1 });
  const share = formatNumber(firstUseSharePct, { maximumFractionDigits: 0 });
  const lead =
    firstUseSharePct >= 60
      ? `Most dwell is incurred before the lot is first touched: the first draw waits ${median}d (${share}% of the ${overall}d event-level median dwell), which points to ordering or scheduling consistently ahead of first need.`
      : `The first draw waits ${median}d (${share}% of the ${overall}d event-level median dwell); the remaining ~${structural}d reflects depletion of the received lot across later consumption events.`;
  return `${lead} Pull the first-use wait down by ordering closer to first need, smaller/more frequent call-offs, or tighter delivery scheduling.`;
}

/** Materialise a compact supplier-OTIF subset for procurement briefs. */

function pctExceedingValue(values: number[], threshold: number): number | null {
  if (values.length === 0) {
    return null;
  }
  return (
    (values.filter((value) => value > threshold).length / values.length) * 100
  );
}

function buildDwellScenarios(
  step: StepDetail,
  range: TimeRange,
  periodCost: number | null,
): DwellScenario[] {
  const medianValue = positiveOrZero(step.stats.median);
  const p25Value = positiveOrZero(step.stats.p25);
  if (medianValue <= 0) {
    return [];
  }
  const stretchCap =
    p25Value > 0 && p25Value <= medianValue ? p25Value : medianValue;
  const months = rangeMonths(range);

  return [
    {
      label: "Moderate",
      targetDays: medianValue,
      reductionPct: cappedReductionPct(
        step.observations,
        medianValue,
        step.stats,
      ),
      rationale: `Caps observed dwell values above the current median (${formatNumber(medianValue, { maximumFractionDigits: 1 })}d) to the median.`,
    },
    {
      label: "Stretch",
      targetDays: stretchCap,
      reductionPct: cappedReductionPct(
        step.observations,
        stretchCap,
        step.stats,
      ),
      rationale: `Caps observed dwell values above P25 (${formatNumber(stretchCap, { maximumFractionDigits: 1 })}d) to lower-quartile performance.`,
    },
  ]

    .map((scenario) => {
      const targetDays = round1(Math.max(0, scenario.targetDays));
      const periodSaving =
        periodCost == null ? null : periodCost * scenario.reductionPct;
      return {
        ...scenario,
        targetDays,
        reductionPct: scenario.reductionPct,
        periodSaving,
        annualizedSaving:
          periodSaving == null ? null : periodSaving * (12 / months),
        reducedPeriodCost:
          periodCost == null || periodSaving == null
            ? null
            : periodCost - periodSaving,
        approximate: step.observations.length === 0,
      };
    })
    .filter((scenario) => scenario.reductionPct > 0);
}

function periodCostOrNull(
  monthly: MonthlyBucket[] | undefined,
  unitPrice: number | null | undefined,
  assumptions: CostAssumptions,
): number | null {
  const costMonths =
    monthly?.filter((month) => month.total_kg_days != null) ?? [];
  if (costMonths.length === 0 || unitPrice == null) {
    return null;
  }
  return computePeriodCost(
    costMonths,
    unitPrice,
    assumptions.waccRate,
    assumptions.storageCost,
  );
}

function computeHighestCostMonth(
  monthly: MonthlyBucket[] | undefined,
  unitPrice: number | null | undefined,
  assumptions: CostAssumptions,
): { month: string; cost: number; events: number } | null {
  const rows =
    monthly
      ?.map((month) => ({
        month: month.month,
        cost: computeMonthlyCost(
          month.total_kg_days,
          unitPrice,
          assumptions.waccRate,
          assumptions.storageCost,
        ),
        events: month.n,
      }))
      .filter(
        (month): month is { month: string; cost: number; events: number } =>
          month.cost != null,
      ) ?? [];
  if (rows.length === 0) {
    return null;
  }
  return rows.sort((left, right) => right.cost - left.cost)[0] ?? null;
}

function diagnoseTimingShape(
  stepType: StepType,
  stats: StepStats,
  trend: OpportunityTrend,
): string[] {
  const signals = shapeSignals(stats, trend);
  const lines = diagnosisFor(stepType, signals);
  if (lines.length > 0) {
    return lines;
  }
  return [
    "The opportunity appears mixed: use the distribution, trend, and underlying rows to separate normal waiting from exceptions.",
  ];
}

function buildPlanningDiagnosis(
  step: StepDetail,
  trend: OpportunityTrend,
  range: TimeRange,
  context: {
    sourceKind: OpportunityBriefSourceKind;
    p95DeviationPct: number | null;
    medianDeviationPct: number | null;
    meanDeviationPct: number | null;
    p95Days: number | null;
  },
): string[] {
  const lines: string[] = [];
  const p95Over = (context.p95DeviationPct ?? 0) > 0;
  const p95Under = (context.p95DeviationPct ?? 0) < 0;
  const p95Text =
    context.p95Days == null
      ? "P95 is unavailable"
      : `P95 is ${formatNumber(context.p95Days, { maximumFractionDigits: 0 })} days (${formatSignedPct(context.p95DeviationPct)} vs plan)`;
  const medianText = `median is ${formatNumber(step.stats.median, { maximumFractionDigits: 1 })} days (${formatSignedPct(context.medianDeviationPct)} vs plan)`;
  const meanText = `mean is ${formatNumber(step.stats.mean, { maximumFractionDigits: 1 })} days (${formatSignedPct(context.meanDeviationPct)} vs plan)`;

  if (
    context.sourceKind === "planning_under" ||
    (p95Under && context.sourceKind !== "planning_over")
  ) {
    lines.push(
      `The planning parameter appears conservative: ${p95Text}, while ${medianText} and ${meanText}. Validate service requirements before tightening the parameter.`,
    );
  } else if (p95Over) {
    lines.push(
      `The planning parameter is below the observed high-percentile lead time: ${p95Text}, while ${medianText} and ${meanText}. Align the planning parameter only after validating whether recent timing is stable.`,
    );
  } else {
    lines.push(
      `The planning parameter is close to observed high-percentile timing: ${p95Text}, and ${medianText} and ${meanText}.`,
    );
  }

  lines.push(trendDiagnosis(trend, range, p95Over, p95Under));
  return lines;
}

function buildEvidenceFlags(
  step: StepDetail,
  options: {
    needsCost: boolean;
    hasUnitCost: boolean;
    trend: OpportunityTrend;
  },
): EvidenceFlag[] {
  const flags: EvidenceFlag[] = [];
  if (step.stats.n > 0 && step.stats.n < LOW_SAMPLE_N) {
    flags.push({
      severity: "warning",
      label: "Low sample",
      detail: `Only ${formatNumber(step.stats.n)} observations are in the selected period.`,
    });
  }
  if ((step.excluded_pct ?? 0) > 20) {
    flags.push({
      severity: "info",
      label: "Outlier-sensitive",
      detail: `${round1(step.excluded_pct ?? 0)}% of observations are excluded by the current outlier setting.`,
    });
  }
  if (options.needsCost && !options.hasUnitCost) {
    flags.push({
      severity: "warning",
      label: "Missing unit cost",
      detail:
        "Potential cost impact cannot be calculated without a material unit cost.",
    });
  }
  if (options.trend.previousN > 0 && options.trend.previousN < LOW_SAMPLE_N) {
    flags.push({
      severity: "info",
      label: "Trend sample",
      detail: `Previous comparison period has ${formatNumber(options.trend.previousN)} observations.`,
    });
  }
  for (const warning of step.planning_warnings ?? []) {
    flags.push({
      severity: warning.level,
      label: "Planning parameter note",
      detail: warning.text,
    });
  }

  const last = latestObservationDate(step.observations);
  if (last) {
    const ageDays = Math.floor(
      (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (ageDays > STALE_OBSERVATION_DAYS) {
      flags.push({
        severity: "warning",
        label: "Stale recent data",
        detail: `Latest observation is ${ageDays} days old.`,
      });
    }
  }
  return flags;
}

function buildDwellDistributionInsight(step: StepDetail): string | null {
  const median = step.stats.median;
  const p95 = step.stats.p95;
  if (median == null || p95 == null || median <= 0 || p95 <= median) {
    return null;
  }
  const spread = p95 - median;
  return `Estimated 95th-percentile dwell is ${formatNumber(p95, { maximumFractionDigits: 1 })}d vs ${formatNumber(median, { maximumFractionDigits: 1 })}d median, so the long tail is at least ${formatNumber(spread, { maximumFractionDigits: 1 })}d above the average case.`;
}

function buildDwellTrigger(
  step: StepDetail,
  periodCost: number | null,
  range: TimeRange,
): OpportunityTrigger {
  const median = step.stats.median;
  const costText = formatCostForText(periodCost, step.cost?.currency ?? null);
  return {
    label: "High dwell cost",
    primaryMetric:
      periodCost == null
        ? `${formatNumber(median, { maximumFractionDigits: 1 })}d median dwell`
        : `${costText} carry cost`,
    reason:
      periodCost == null
        ? `Qualified because observed median dwell is ${formatNumber(median, { maximumFractionDigits: 1 })} days in the selected period.`
        : `Qualified because ${range} carry cost is ${costText} and observed median dwell is ${formatNumber(median, { maximumFractionDigits: 1 })} days.`,
  };
}

function buildPlanningTrigger(
  step: StepDetail,
  p95DeviationPct: number | null,
  applicablePlan: number | null = step.plan,
): OpportunityTrigger {
  const plan = applicablePlan;
  const p95 = step.stats.p95;
  const direction =
    p95DeviationPct == null
      ? "needs review"
      : p95DeviationPct > 0
        ? "may not protect the observed service level"
        : "may be conservative versus observed performance";
  return {
    label:
      p95DeviationPct != null && p95DeviationPct < 0
        ? "Conservative planning parameter"
        : "Planning parameter divergence",
    primaryMetric:
      p95DeviationPct == null
        ? "P95 vs plan unavailable"
        : `${p95DeviationPct > 0 ? "+" : ""}${formatNumber(p95DeviationPct, { maximumFractionDigits: 0 })}% P95 vs plan`,
    reason:
      plan == null || p95 == null
        ? "Qualified because the planning assumption should be reviewed once more observations are available."
        : `Qualified because P95 is ${formatNumber(p95, { maximumFractionDigits: 1 })} days vs plan ${formatNumber(plan, { maximumFractionDigits: 1 })} days; the parameter ${direction}.`,
  };
}

function buildConfidence(
  step: StepDetail,
  flags: EvidenceFlag[],
): OpportunityConfidence {
  const caveats = flags.map((flag) => `${flag.label}: ${flag.detail}`);
  const hasLowConfidenceWarning = flags.some(
    (flag) => flag.severity === "warning" && flag.label !== "Stale recent data",
  );
  if (step.stats.n < LOW_SAMPLE_N || hasLowConfidenceWarning) {
    return {
      label: "Low",
      caveats,
      explanation:
        caveats.length > 0
          ? caveats.join(" ")
          : `Only ${formatNumber(step.stats.n)} observations are available in the selected period.`,
    };
  }
  const hasWarning = flags.some((flag) => flag.severity === "warning");
  if (step.stats.n < WARNING_SAMPLE_N || hasWarning) {
    return {
      label: "Warning",
      caveats,
      explanation:
        caveats.length > 0
          ? caveats.join(" ")
          : `${formatNumber(step.stats.n)} retained observations are available; validate the underlying rows before changing planning assumptions.`,
    };
  }
  return {
    label: "High",
    caveats,
    explanation:
      caveats.length > 0
        ? caveats.join(" ")
        : `${formatNumber(step.stats.n)} retained observations are available and no major evidence caveats were detected.`,
  };
}

/** Resolve the most representative binding score for a node (prefers "all"). */
function resolveBindingScore(
  node: SiteNode | null | undefined,
): BindingScore | null {
  const binding = node?.binding;
  if (!binding) {
    return null;
  }
  if (binding.all) {
    return binding.all;
  }
  const first = Object.values(binding)[0];
  return first ?? null;
}

/** E2E leverage from the node's binding score: does reducing this step move the
 *  end-to-end lead time, and what becomes binding next. */
function buildE2ELeverage(
  node: SiteNode | null | undefined,
): E2ELeverage | null {
  const score = resolveBindingScore(node);
  if (!score) {
    return null;
  }
  const nextChain = score.next_bottleneck_chains?.[0] ?? null;
  return {
    bindingSharePct: score.binding_share * 100,
    expectedMarginalPerDay: score.expected_marginal_per_day,
    nextBottleneckDays: score.next_bottleneck_days,
    nextBottleneckLabel: nextChain?.label ?? null,
  };
}

/** Per-product recipe membership from each consuming product's own node. */
function buildRecipeMembership(
  productNodes: ProductNodeRef[] | undefined,
): RecipeMembership[] {
  if (!productNodes || productNodes.length === 0) {
    return [];
  }
  return productNodes
    .map((ref) => ({
      productName: ref.productName,
      inCurrentRecipe: ref.node.in_current_recipe ?? null,
    }))
    .sort((left, right) => left.productName.localeCompare(right.productName));
}

/** True when the material is in no consuming product's current recipe. */
function isOutOfCurrentRecipe(
  node: SiteNode | null | undefined,
  membership: RecipeMembership[],
): boolean {
  if (membership.length > 0) {
    return membership.every((month) => month.inCurrentRecipe === false);
  }
  return node?.in_current_recipe === false;
}

/** Group the step's consumption detail rows by consuming produced material and
 *  re-apply the carrying-cost model to estimate impact per consuming product. */
function computePerProductImpact(
  step: StepDetail,
  range: TimeRange,
  assumptions: CostAssumptions,
): PerProductImpactRow[] {
  const detail = step.detail_rows;
  if (!detail) {
    return [];
  }
  const keys = new Set(detail.columns.map((column) => column.key));
  if (
    !keys.has("kg_days") ||
    (!keys.has("cons_matnr") && !keys.has("cons_material_name"))
  ) {
    return [];
  }
  const cutoff = cutoffForRange(range);
  const dateKey = keys.has("consumption_date") ? "consumption_date" : null;
  const rate = costRatePerKgDay(
    step.cost?.unit_price,
    assumptions.waccRate,
    assumptions.storageCost,
  );
  const hasUnitCost = step.cost?.unit_price != null;

  const groups = new Map<
    string,
    {
      label: string;
      kgDays: number;
      events: number;
      recipeTrue: number;
      recipeFalse: number;
    }
  >();
  for (const row of detail.rows) {
    if (dateKey) {
      const dv = row[dateKey];
      if (typeof dv === "string" && dv.slice(0, 7) < cutoff) {
        continue;
      }
    }
    const code = row.cons_matnr;
    const name = row.cons_material_name;
    const key = String(code ?? name ?? "unknown");
    const label = String(name ?? code ?? "Unknown");
    const kg = toNumber(row.kg_days);
    const bucket = groups.get(key) ?? {
      label,
      kgDays: 0,
      events: 0,
      recipeTrue: 0,
      recipeFalse: 0,
    };
    bucket.kgDays += kg;
    bucket.events += 1;
    // Emitted as 1 (in current BOM) / 0 (off-recipe) / null (no BOM to judge).
    const inRecipe = row.cons_in_current_recipe;
    if (inRecipe === 1) {
      bucket.recipeTrue += 1;
    } else if (inRecipe === 0) {
      bucket.recipeFalse += 1;
    }
    groups.set(key, bucket);
  }

  const total = [...groups.values()].reduce(
    (sum, group) => sum + group.kgDays,
    0,
  );
  if (groups.size <= 1 || total <= 0) {
    return [];
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      kgDays: group.kgDays,
      periodCost: hasUnitCost ? group.kgDays * rate : null,
      sharePct: total > 0 ? (group.kgDays / total) * 100 : 0,
      events: group.events,
      // Off-recipe only when we saw an explicit "not in current BOM" flag and
      // never an in-recipe one; null when the consumer had no BOM to judge.
      inCurrentRecipe:
        group.recipeTrue > 0 ? true : group.recipeFalse > 0 ? false : null,
    }))
    .sort((left, right) => right.kgDays - left.kgDays);
}

/** Dwell stages whose detail rows carry the receipt -> consumption tranche
 *  structure needed to recover the first draw off each received batch. */
const FIRST_USE_DWELL_TYPES: ReadonlySet<StepType> = new Set<StepType>([
  "raw_material_dwell",
  "intermediate_dwell",
]);
const MIN_FIRST_USE_BATCHES = 3;

/**
 * First-use dwell: per received batch, the dwell of its earliest consumption
 * event (receipt -> first use). The first draw is found over all detail rows so
 * pre-window tranches are not mistaken for the first use; batches are then kept
 * when that first use falls inside the selected window.
 */
function buildFirstUseDwell(
  step: StepDetail,
  range: TimeRange,
): FirstUseDwellSummary | null {
  if (!FIRST_USE_DWELL_TYPES.has(step.type)) {
    return null;
  }
  const detail = step.detail_rows;
  if (!detail) {
    return null;
  }
  const keys = new Set(detail.columns.map((column) => column.key));
  if (
    !keys.has("batch") ||
    !keys.has("consumption_date") ||
    !keys.has("dwell_days")
  ) {
    return null;
  }

  const firstByBatch = new Map<string, { date: string; dwell: number }>();
  for (const row of detail.rows) {
    const batch = row.batch;
    const date = row.consumption_date;
    const dwell = toNumberOrNull(row.dwell_days);
    if (
      batch == null ||
      typeof date !== "string" ||
      dwell == null ||
      dwell < 0
    ) {
      continue;
    }
    const key = String(batch);
    const existing = firstByBatch.get(key);
    if (!existing || date < existing.date) {
      firstByBatch.set(key, { date, dwell });
    }
  }

  const cutoff = cutoffForRange(range);
  const values = [...firstByBatch.values()]
    .filter((value) => value.date.slice(0, 7) >= cutoff)
    .map((value) => value.dwell);
  if (values.length < MIN_FIRST_USE_BATCHES) {
    return null;
  }
  values.sort((left, right) => left - right);

  const medianDays = round1(percentileOf(values, 50));
  const p95Days = round1(percentileOf(values, 95));
  const meanDays = round1(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
  const overallMedianDays = step.stats.median ?? null;
  const structuralDays =
    overallMedianDays != null
      ? round1(Math.max(0, overallMedianDays - medianDays))
      : null;
  const firstUseSharePct =
    overallMedianDays != null && overallMedianDays > 0
      ? Math.min(100, (medianDays / overallMedianDays) * 100)
      : null;
  return {
    medianDays,
    p95Days,
    meanDays,
    nBatches: values.length,
    overallMedianDays,
    structuralDays,
    firstUseSharePct,
    note: buildFirstUseNote(
      medianDays,
      overallMedianDays,
      structuralDays,
      firstUseSharePct,
    ),
  };
}

function buildSupplierSummary(
  step: StepDetail,
  range: TimeRange,
): SupplierBriefSummary | null {
  const block = step.supplier_otif;
  if (!block) {
    return null;
  }
  const materialised = recomputeSupplierBlock(block, range);
  if (materialised.n_lines === 0) {
    return null;
  }
  const vendors: SupplierBriefVendor[] = materialised.vendors
    .map((value) => ({
      name: value.vendor_name ?? value.vendor_id ?? "Unknown vendor",
      otifPct: value.otif_pct,
      meanDaysLateAll: value.mean_days_late_all,
      ge7dPct: value.late_buckets.ge_7d_pct ?? null,
      nLines: value.n_lines,
    }))
    .sort(
      (left, right) =>
        (right.meanDaysLateAll ?? Number.NEGATIVE_INFINITY) -
        (left.meanDaysLateAll ?? Number.NEGATIVE_INFINITY),
    )
    .slice(0, 3);
  const worstEvents = (materialised.worst_events ?? [])
    .slice(0, 5)
    .map((event) => ({
      vendorName: event.vendor_name,
      materialName: event.material_name,
      poNumber: event.po_number,
      daysLate: event.days_late,
      date: event.first_gr_date ?? event.promised_date ?? null,
    }));
  return {
    primaryVendorName: materialised.primary_vendor?.name ?? null,
    vendors,
    worstEvents,
    nLines: materialised.n_lines,
    coveragePct: materialised.coverage_pct,
    dataQualityNote: materialised.data_quality_note,
  };
}

/** Top evidence rows (longest, and largest kg-days for dwell) from detail rows. */
function buildTopEvidence(
  step: StepDetail,
  range: TimeRange,
): BriefEvidenceRow[] {
  const detail = step.detail_rows;
  if (!detail) {
    return [];
  }
  const keys = new Set(detail.columns.map((column) => column.key));
  const dateKey = pickFirstKey(keys, [
    "consumption_date",
    "receipt_date",
    "po_date",
    "delivery_date",
    "qa_release_date",
  ]);
  const daysKey =
    pickFirstKey(keys, ["dwell_days", "duration", "days", "lead_time_days"]) ??
    step.value_col ??
    null;
  const kgKey = keys.has("kg_days") ? "kg_days" : null;
  const labelKey = pickFirstKey(keys, [
    "batch",
    "po_number",
    "cons_material_name",
    "material",
  ]);
  const cutoff = cutoffForRange(range);

  const rows = detail.rows.filter((row) => {
    if (!dateKey) {
      return true;
    }
    const dv = row[dateKey];
    return typeof dv !== "string" || dv.slice(0, 7) >= cutoff;
  });
  if (rows.length === 0) {
    return [];
  }

  const rankKey = kgKey ?? daysKey;
  if (!rankKey) {
    return [];
  }
  const ranked = [...rows]
    .sort((left, right) => toNumber(right[rankKey]) - toNumber(left[rankKey]))
    .slice(0, 5);
  return ranked.map((row) => ({
    label: labelKey ? String(row[labelKey] ?? "–") : "–",
    date: dateKey && typeof row[dateKey] === "string" ? row[dateKey] : null,
    days: daysKey ? toNumberOrNull(row[daysKey]) : null,
    kgDays: kgKey ? toNumberOrNull(row[kgKey]) : null,
  }));
}

/** Provenance label (source population + filter). */
function buildProvenance(step: StepDetail): string | null {
  const source = step.source;
  if (!source?.label) {
    return null;
  }
  const filter = source.filter ? ` (${source.filter})` : "";
  return `${source.label}; ${formatNumber(source.n)} observations${filter}.`;
}

/** Production normalisation caveat (durations scaled to a common quantity). */
function buildNormalizationNote(step: StepDetail): string | null {
  const norm = step.normalization;
  if (!norm) {
    return null;
  }
  const unit = norm.unit ? ` ${norm.unit}` : "";
  return `Durations are normalised to ${formatNumber(norm.qty)}${unit} per batch (${norm.basis}, ${norm.window} window, ${formatNumber(norm.n_batches)} batches), so they read as "days per typical batch".`;
}

/** Plain-language yield / consumption notes for production steps. */
function buildProductionInsight(step: StepDetail): ProductionInsight | null {
  if (step.type !== "production") {
    return null;
  }
  let yieldNote: string | null = null;
  let consumptionNote: string | null = null;

  const yd = step.yield_data;
  if (yd && yd.stats.median != null && yd.reference > 0) {
    const pct = ((yd.stats.median - yd.reference) / yd.reference) * 100;
    yieldNote = `Median receipt ratio is ${formatNumber(yd.stats.median, { maximumFractionDigits: 1 })} vs ${formatNumber(yd.reference, { maximumFractionDigits: 1 })} reference (${formatSignedPct(pct)}); under-yield extends effective production duration per batch.`;
  }

  const cd = step.consumption_data;
  const agg = cd?.aggregate;
  if (agg) {
    const parts: string[] = [];
    if (agg.weighted_variance_pct != null) {
      parts.push(
        `${formatSignedPct(agg.weighted_variance_pct)} weighted consumption variance`,
      );
    }
    if (agg.n_orders_off_bom) {
      parts.push(`${formatNumber(agg.n_orders_off_bom)} off-BOM orders`);
    }
    if (agg.n_orders_substitution) {
      parts.push(
        `${formatNumber(agg.n_orders_substitution)} with substitutions`,
      );
    }
    if (parts.length > 0) {
      consumptionNote = `Consumption: ${parts.join(", ")}.`;
    }
  }

  if (!yieldNote && !consumptionNote) {
    return null;
  }
  return { yield: yieldNote, consumption: consumptionNote };
}

/** Distribution clustering descriptor from coefficient of variation / IQR. */
function buildClusteringInsight(stats: StepStats): string | null {
  const median = stats.median;
  const mean = stats.mean;
  const std = stats.std;
  if (median == null || median <= 0) {
    return null;
  }
  const p25 = stats.p25 ?? null;
  const p75 = stats.p75 ?? null;
  const iqrRatio = p25 != null && p75 != null ? (p75 - p25) / median : null;
  const cv = mean != null && mean > 0 && std != null ? std / mean : null;
  const metricParts: string[] = [];
  if (cv != null) {
    metricParts.push(`CV ${formatNumber(cv, { maximumFractionDigits: 2 })}`);
  }
  if (iqrRatio != null) {
    metricParts.push(
      `IQR/median ${formatNumber(iqrRatio, { maximumFractionDigits: 2 })}`,
    );
  }
  const metricText =
    metricParts.length > 0 ? ` (${metricParts.join(", ")})` : "";

  const score = iqrRatio ?? cv;
  if (score == null) {
    return null;
  }
  if (score < 0.35) {
    return `Tightly clustered${metricText}: values sit close to the median, pointing to a structural floor rather than episodic variation.`;
  }
  if (score < 0.75) {
    return `Moderately dispersed${metricText}: a mix of typical cases and longer events.`;
  }
  return `Long-tailed${metricText}: a minority of long events drive much of the spread.`;
}

/** Tail-vs-typical trend note from stat-by-stat period deltas. */
function buildTailTrendNote(
  observations: Observation[],
  range: TimeRange,
): string | null {
  const deltas = computePeriodDeltas(observations, range);
  const medianDelta = deltas.statDeltas.median;
  const p95Delta = deltas.statDeltas.p95;
  if (medianDelta == null || p95Delta == null) {
    return null;
  }
  if (p95Delta - medianDelta > 15) {
    return `The tail is worsening faster than the typical case: P95 moved ${formatSignedPct(p95Delta)} vs ${formatSignedPct(medianDelta)} for the median against the previous period, so the opportunity is increasingly driven by exceptions.`;
  }
  if (medianDelta - p95Delta > 15) {
    return `The typical case is moving more than the tail: the median changed ${formatSignedPct(medianDelta)} vs ${formatSignedPct(p95Delta)} for P95 against the previous period, suggesting a broad shift rather than a few exceptions.`;
  }
  return null;
}

/** Planning calibration impact: buffer released and residual late-event risk. */
function buildCalibrationImpact(
  step: StepDetail,
  currentPlanDays: number | null,
): PlanningCalibrationImpact[] {
  const targets: Array<{
    label: string;
    days: number | null;
    description: string;
  }> = [
    {
      label: "Median",
      days: step.stats.median,
      description: "Stretch target for operational excellence.",
    },
    {
      label: "P75",
      days: step.stats.p75,
      description: "Covers ~75% of observed events.",
    },
    {
      label: "P85",
      days: step.stats.p85,
      description: "More cautious; some late events remain expected.",
    },
    {
      label: "P95",
      days: step.stats.p95,
      description:
        "Estimated 95th-percentile timing, used as a high-percentile planning reference.",
    },
  ];

  const values = step.durations;
  return targets.map((threshold) => ({
    label: threshold.label,
    days: threshold.days,
    bufferDaysVsPlan:
      currentPlanDays != null && threshold.days != null
        ? currentPlanDays - threshold.days
        : null,
    pctExceeding:
      threshold.days == null ? null : pctExceedingValue(values, threshold.days),
    description: threshold.description,
  }));
}

function dwellRecommendationSummary(
  step: StepDetail,
  scenarios: DwellScenario[],
  ctx: PlaybookContext,
): string {
  const moderate =
    scenarios.find((scenario) => scenario.label === "Moderate") ?? scenarios[0];
  if (!moderate) {
    return "Investigate whether this step can be reduced; impact could not be quantified from current cost data.";
  }
  const target = `${formatNumber(moderate.targetDays, { maximumFractionDigits: 1 })} days`;
  const playbook = PLAYBOOKS[step.type];
  const lead = playbook.dwellSummaryLead(ctx);

  const saving =
    moderate.annualizedSaving == null
      ? null
      : formatCostForText(
          moderate.annualizedSaving,
          step.cost?.currency ?? null,
        );
  return `${lead}; the moderate scenario caps long dwell at ${target}${saving ? ` and estimates ${saving} annualized saving` : ""}.`;
}

function planningRecommendationSummary(
  step: StepDetail,
  safePlanningDays: number | null,
  p95DeviationPct: number | null,
  ctx: PlaybookContext,
  currentPlanDays: number | null = step.plan,
): string {
  if (safePlanningDays == null) {
    return "Review the planning assumption once more observations are available.";
  }
  const playbook = PLAYBOOKS[step.type];
  const lead = playbook.planningSummaryLead(ctx);

  if (currentPlanDays == null || currentPlanDays <= 0) {
    return `${lead}; consider setting a planning assumption around ${safePlanningDays} days if this service level is appropriate.`;
  }
  if ((p95DeviationPct ?? 0) > 0) {
    return `${lead}; current timing exceeds plan and P95 suggests a safer planning assumption around ${safePlanningDays} days.`;
  }
  return `${lead}; the current plan is above the median and P95 of ${safePlanningDays} days provides context for whether the assumption can be tightened.`;
}

function ceilOrNull(value: number | null | undefined): number | null {
  return value == null ? null : Math.ceil(value);
}

export function buildDwellOpportunityBrief(
  step: StepDetail,
  historicalStep: StepDetail,
  range: TimeRange,
  assumptions: CostAssumptions,
  context: DwellBriefContext = {},
): DwellOpportunityBrief {
  const periodCost = periodCostOrNull(
    step.monthly,
    step.cost?.unit_price,
    assumptions,
  );
  const trend = computeTrend(historicalStep.observations, range);
  const scenarios = buildDwellScenarios(step, range, periodCost);
  const tailTrendNote = buildTailTrendNote(historicalStep.observations, range);
  const diagnosis = diagnoseTimingShape(step.type, step.stats, trend);
  if (tailTrendNote) {
    diagnosis.push(tailTrendNote);
  }
  const evidenceFlags = buildEvidenceFlags(step, {
    needsCost: true,
    hasUnitCost: step.cost?.unit_price != null,
    trend,
  });
  const recipeMembership = buildRecipeMembership(context.productNodes);
  const outOfCurrentRecipe = isOutOfCurrentRecipe(
    context.siteNode,
    recipeMembership,
  );
  if (outOfCurrentRecipe) {
    evidenceFlags.push({
      severity: "warning",
      label: "Not in current recipe",
      detail:
        "This material is no longer reachable from the finished good in the current BOM/recipe, so reductions may not affect future batches.",
    });
  }
  const playbookCtx: PlaybookContext = {
    stats: step.stats,
    trend,
    plan: step.plan,
  };

  return {
    kind: "dwell",
    stepType: step.type,
    opportunityTrigger: buildDwellTrigger(step, periodCost, range),
    confidence: buildConfidence(step, evidenceFlags),
    periodCost,
    annualizedCost:
      periodCost == null ? null : periodCost * (12 / rangeMonths(range)),
    currency: step.cost?.currency ?? null,
    scenarios,
    diagnosis,
    evidenceFlags,
    trend,
    distributionInsight: buildDwellDistributionInsight(step),
    highestCostMonth: computeHighestCostMonth(
      step.monthly,
      step.cost?.unit_price,
      assumptions,
    ),
    recommendationSummary: dwellRecommendationSummary(
      step,
      scenarios,
      playbookCtx,
    ),
    recommendedActions: PLAYBOOKS[step.type].recommendedActions,

    e2eLeverage: buildE2ELeverage(context.siteNode),
    perProductImpact: computePerProductImpact(step, range, assumptions),
    recipeMembership,
    outOfCurrentRecipe,
    supplier: buildSupplierSummary(step, range),
    topEvidence: buildTopEvidence(step, range),
    provenance: buildProvenance(step),
    normalizationNote: buildNormalizationNote(step),
    productionInsight: buildProductionInsight(step),
    clustering: buildClusteringInsight(step.stats),
    tailTrendNote,
    firstUseDwell: buildFirstUseDwell(step, range),
  };
}

export function buildPlanningOpportunityBrief(
  step: StepDetail,
  historicalStep: StepDetail,
  range: TimeRange,
  sourceKind: OpportunityBriefSourceKind = null,
): PlanningOpportunityBrief {
  const trend = computeTrend(historicalStep.observations, range);
  const procurementPlanning =
    step.type === "procurement"
      ? summarizeProcurementPlanning(step.observations, step.plan)
      : null;
  const currentPlanDays = step.plan;
  // Observed P95 is shown raw (1 dp) across the brief; the rounded-up integer
  // is used only for prose recommendations ("around N days").
  const p95PlanDays = ceilOrNull(step.stats.p95);
  const medianDeviationPct =
    procurementPlanning?.medianVariancePct ??
    (currentPlanDays && currentPlanDays > 0
      ? (((step.stats.median ?? 0) - currentPlanDays) / currentPlanDays) * 100
      : null);
  const meanDeviationPct =
    procurementPlanning?.meanVariancePct ??
    (currentPlanDays && currentPlanDays > 0
      ? (((step.stats.mean ?? 0) - currentPlanDays) / currentPlanDays) * 100
      : null);
  const p95DeviationPct =
    currentPlanDays && currentPlanDays > 0 && step.stats.p95 != null
      ? ((step.stats.p95 - currentPlanDays) / currentPlanDays) * 100
      : null;
  const calibrationDirection =
    p95DeviationPct == null
      ? "review"
      : p95DeviationPct > 0
        ? "increase"
        : "tighten";
  const evidenceFlags = buildEvidenceFlags(step, {
    needsCost: false,
    hasUnitCost: true,
    trend,
  });
  const confidence = buildConfidence(step, evidenceFlags);
  const nExceedingPlan =
    (procurementPlanning?.pctExceedingPlan ?? step.pct_exceeding_plan) == null
      ? null
      : Math.round(
          step.stats.n *
            ((procurementPlanning?.pctExceedingPlan ??
              step.pct_exceeding_plan ??
              0) /
              100),
        );
  const playbookCtx: PlaybookContext = {
    stats: step.stats,
    trend,
    plan: currentPlanDays,
  };
  const tailTrendNote = buildTailTrendNote(historicalStep.observations, range);
  const diagnosis = buildPlanningDiagnosis(step, trend, range, {
    sourceKind,
    p95DeviationPct,
    medianDeviationPct,
    meanDeviationPct,
    p95Days: p95PlanDays,
  });
  if (tailTrendNote) {
    diagnosis.push(tailTrendNote);
  }

  return {
    kind: "planning",
    stepType: step.type,
    opportunityTrigger: buildPlanningTrigger(
      step,
      p95DeviationPct,
      currentPlanDays,
    ),
    confidence,
    currentPlanDays,
    p95Days: step.stats.p95,
    medianDays: step.stats.median,
    meanDays: step.stats.mean,
    serviceLevelOptions: [
      {
        label: "Median",
        days: step.stats.median,
        description:
          "Typical performance; useful as an operational stretch reference, not a conservative planning parameter.",
      },
      {
        label: "P75",
        days: step.stats.p75,
        description: "Covers roughly three quarters of observed events.",
      },
      {
        label: "P85",
        days: step.stats.p85,
        description:
          "A planning option where some late events remain expected, with 85% of observations below this point.",
      },
      {
        label: "P95",
        days: step.stats.p95,
        description:
          "Estimated 95th-percentile timing, used as a high-percentile planning reference.",
      },
    ],

    medianDeviationPct,
    meanDeviationPct,
    p95DeviationPct,
    pctExceedingPlan:
      procurementPlanning?.pctExceedingPlan ?? step.pct_exceeding_plan ?? null,
    nExceedingPlan,
    calibrationDirection,
    calibrationImpact: buildCalibrationImpact(step, currentPlanDays),
    diagnosis,
    evidenceFlags,
    trend,
    recommendationSummary: planningRecommendationSummary(
      step,
      p95PlanDays,
      p95DeviationPct,
      playbookCtx,
      currentPlanDays,
    ),
    recommendedActions: PLAYBOOKS[step.type].recommendedActions,

    supplier: buildSupplierSummary(step, range),
    topEvidence: buildTopEvidence(step, range),
    provenance: buildProvenance(step),
    normalizationNote: buildNormalizationNote(step),
    productionInsight: buildProductionInsight(step),
    clustering: buildClusteringInsight(step.stats),
    tailTrendNote,
  };
}
