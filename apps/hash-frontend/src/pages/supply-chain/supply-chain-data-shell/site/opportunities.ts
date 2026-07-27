import { formatCost, formatNumber } from "../../shared/cost";
import { procurementStepDisplayLabel } from "../../shared/procurement-planning-ui";
import { siteNodeKey } from "../../shared/site-node-key";
import { siteNodeDisplayLabel } from "./shared/helpers";
import { LOW_SAMPLE_N } from "./shared/row-types";

import type { StatusOption } from "../../shared/status";
import type { TimeRange } from "../../shared/time-range";
import type { SiteNode } from "../../shared/types";
import type { DwellRow, PlanningRow } from "./shared/row-types";

export type OpportunityKind = "dwell_cost" | "planning_over" | "planning_under";

export interface OpportunityStatus {
  read: boolean;
}

export type OpportunityStatuses = Record<string, OpportunityStatus>;

export interface OpportunityStatusActions {
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onSaveStatus: (
    node: SiteNode,
    status: { category: StatusOption; text: string },
  ) => void;
}

export interface SiteOpportunity {
  id: string;
  kind: OpportunityKind;
  siteId: string;
  productId: string;
  stepId: string;
  node: SiteNode;
  title: string;
  products: Array<{ id: string; name: string }>;
  typeLabel: string;
  impactLabel: string;
  impactValue: string;
  impactTone: "danger" | "success" | "neutral";
  evidence: string;
  sampleLabel: string;
  currentSampleN: number;
  previousSampleN?: number | null;
  confidenceLabel: string;
  score: number;
  briefHref?: string;
}

export interface BuildSiteOpportunitiesInput {
  siteId: string;
  dwellRows: DwellRow[];
  planningRows: PlanningRow[];
  timeRange: TimeRange;
  currency: string | null;
  briefHref: (
    type: "dwell" | "planning",
    node: SiteNode,
    kind?: OpportunityKind,
  ) => string;
}

const DWELL_DAYS_CUTOFF = 7;
// Minimum annualised carrying cost for a dwell-cost opportunity: below this the saving isn't worth surfacing.
const DWELL_MIN_PERIOD_COST = 5000;
const PLANNING_RATIO_THRESHOLD = 0.1;

function opportunityId(
  siteId: string,
  kind: OpportunityKind,
  node: SiteNode,
  context: string,
): string {
  return [siteId, kind, context, siteNodeKey(node)].join("::");
}

function confidenceLabel(
  currentN: number,
  previousN: number | null | undefined,
  hasRequiredData: boolean,
  includePrevious: boolean,
): string {
  if (!hasRequiredData) {
    return "Low sample";
  }
  if (
    currentN < LOW_SAMPLE_N ||
    (includePrevious &&
      previousN != null &&
      previousN > 0 &&
      previousN < LOW_SAMPLE_N)
  ) {
    return "Low sample";
  }
  return "Good sample";
}

function sampleLabel(currentN: number, previousN?: number | null): string {
  if (previousN == null || previousN <= 0) {
    return `Samples ${formatNumber(currentN)}`;
  }
  return `Samples ${formatNumber(currentN)}; prev ${formatNumber(previousN)}`;
}

function opportunityTitle(row: SiteNode): string {
  const label = siteNodeDisplayLabel(row);
  return row.type === "procurement"
    ? procurementStepDisplayLabel(label, "qualified")
    : label;
}

function planningOpportunity(
  siteId: string,
  row: PlanningRow,
  kind: "planning_over" | "planning_under",
  p95DeviationPct: number,
  briefHref: (
    type: "dwell" | "planning",
    node: SiteNode,
    kind?: OpportunityKind,
  ) => string,
  idContext: string,
): SiteOpportunity {
  const plan = row.plan ?? 0;
  return {
    id: opportunityId(siteId, kind, row, idContext),
    kind,
    siteId,
    productId: row.products[0]?.id ?? "",
    stepId: row.id,
    node: row,
    title: opportunityTitle(row),
    products: row.products,
    typeLabel: kind === "planning_over" ? "Planning over" : "Planning under",
    impactLabel: "P95 vs plan",
    impactValue: `${p95DeviationPct > 0 ? "+" : ""}${formatNumber(p95DeviationPct, { maximumFractionDigits: 0 })}%`,
    impactTone: kind === "planning_over" ? "danger" : "success",
    evidence: `Plan ${formatNumber(plan, { maximumFractionDigits: 0 })}d; median ${formatNumber(row.stats.median, { maximumFractionDigits: 1 })}d; P95 ${formatNumber(row.stats.p95, { maximumFractionDigits: 1 })}d`,
    sampleLabel: sampleLabel(row.stats.n),
    currentSampleN: row.stats.n,
    confidenceLabel: confidenceLabel(row.stats.n, null, true, false),
    score: Math.abs(p95DeviationPct),
    briefHref: briefHref("planning", row, kind),
  };
}
export function buildSiteOpportunities({
  siteId,
  dwellRows,
  planningRows,
  timeRange,
  currency,
  briefHref,
}: BuildSiteOpportunitiesInput): SiteOpportunity[] {
  // Each kind is collected separately then sorted by its own impact (`score`):
  // dwell by periodCost, planning by |P95 deviation|.
  // This keeps the Opportunities table order independent of the dwell/planning
  // table sort. The whole table (set, values, order, and read state) is also
  // independent of the Measure dropdown: every gate/metric below reads a fixed
  // statistic and `measure` is no longer part of the opportunity id.
  const dwellOpps: SiteOpportunity[] = [];
  const planningOpps: SiteOpportunity[] = [];
  const idContext = timeRange;
  for (const row of dwellRows) {
    // Gate on a fixed statistic (median), not the live `measure`: the dwell-cost
    // opportunity is driven by carrying cost (kg-days x assumptions), so its
    // qualification and displayed value must not change when the Measure
    // dropdown is toggled. Below the 5k floor the saving isn't worth surfacing.
    const days = row.stats.median;
    if (
      days == null ||
      days < DWELL_DAYS_CUTOFF ||
      row.periodCost < DWELL_MIN_PERIOD_COST
    ) {
      continue;
    }
    dwellOpps.push({
      id: opportunityId(siteId, "dwell_cost", row, idContext),
      kind: "dwell_cost",
      siteId,
      productId: row.products[0]?.id ?? "",
      stepId: row.id,
      node: row,
      title: opportunityTitle(row),
      products: row.products,
      typeLabel: "Dwell cost",
      impactLabel: `Cost (${timeRange})`,
      impactValue: formatCost(row.periodCost, currency, { compact: true }),
      impactTone: "danger",
      evidence: `${formatNumber(days, { maximumFractionDigits: 1 })}d observed; ${formatNumber(row.stats.p95, { maximumFractionDigits: 1 })}d P95`,
      sampleLabel: sampleLabel(row.stats.n),
      currentSampleN: row.stats.n,
      confidenceLabel: confidenceLabel(
        row.stats.n,
        null,
        row.cost?.unit_price != null,
        false,
      ),
      score: row.periodCost,
      briefHref: briefHref("dwell", row, "dwell_cost"),
    });
  }
  for (const row of planningRows) {
    const p95 = row.stats.p95;
    const plan = row.plan;
    if (p95 == null || plan == null || plan <= 0) {
      continue;
    }
    const p95DeviationPct = ((p95 - plan) / plan) * 100;
    if (p95DeviationPct >= PLANNING_RATIO_THRESHOLD * 100) {
      planningOpps.push(
        planningOpportunity(
          siteId,
          row,
          "planning_over",
          p95DeviationPct,
          briefHref,
          idContext,
        ),
      );
    } else if (p95DeviationPct <= -PLANNING_RATIO_THRESHOLD * 100) {
      planningOpps.push(
        planningOpportunity(
          siteId,
          row,
          "planning_under",
          p95DeviationPct,
          briefHref,
          idContext,
        ),
      );
    }
  }
  const byScoreDesc = (a: SiteOpportunity, b: SiteOpportunity) =>
    b.score - a.score;
  dwellOpps.sort(byScoreDesc);
  planningOpps.sort(byScoreDesc);
  return [...dwellOpps, ...planningOpps];
}
