/**
 * Per-step-type recommendation copy for opportunity briefs.
 *
 * The brief renderer keeps its layout — distribution charts, evidence tables,
 * scenarios — but pulls all step-type-specific phrasing from this registry so
 * a procurement brief talks about supplier OTIF and a QA-hold brief talks about
 * lab throughput, while the underlying numeric model stays generic.
 *
 * Adding a new step type? Add an entry to PLAYBOOKS. Adding a new shape signal?
 * Extend ShapeSignal here, then plumb it into `diagnoseTimingShape` and every
 * playbook entry.
 */

import type { StepStats, StepType } from "../../shared/types";
import type { OpportunityTrend } from "./opportunity-utils";

/** Distribution-level signals that drive the diagnosis sentences. */
export type ShapeSignal =
  | "long_tail"
  | "tight_high_median"
  | "worsening"
  | "improving"
  | "mixed";

export interface PlaybookContext {
  stats: StepStats;
  trend: OpportunityTrend;
  plan: number | null;
}

export interface RecommendedAction {
  text: string;
  kind?: "evidence" | "process" | "policy" | "planning";
}

export interface StepTypePlaybook {
  /** Maps a shape signal to a sentence tailored to this step type. */
  diagnosis: Record<ShapeSignal, string>;
  /** Lead clause for the dwell brief summary; gets combined with numeric target. */
  dwellSummaryLead: (ctx: PlaybookContext) => string;
  /** Lead clause for the planning brief summary; gets combined with numeric target. */
  planningSummaryLead: (ctx: PlaybookContext) => string;
  /** Ordered investigation plan shown at the end of the brief. */
  recommendedActions: RecommendedAction[];
}

/** Pick the most salient shape signal for a step. Mirrors the previous heuristic but is reusable. */
export function shapeSignals(
  stats: StepStats,
  trend: OpportunityTrend,
): ShapeSignal[] {
  const median = stats.median ?? 0;
  const p25 = stats.p25 ?? 0;
  const p75 = stats.p75 ?? 0;
  const p95 = stats.p95 ?? 0;
  const signals: ShapeSignal[] = [];
  if (median > 0 && p95 > median * 2) {
    signals.push("long_tail");
  }
  if (median >= 3 && (p75 - p25) / median < 0.35) {
    signals.push("tight_high_median");
  }
  if (trend.direction === "worsening") {
    signals.push("worsening");
  }
  if (trend.direction === "improving") {
    signals.push("improving");
  }
  if (signals.length === 0) {
    signals.push("mixed");
  }
  return signals;
}

const DWELL_PLAN_LEAD = (ctx: PlaybookContext, opName: string) => {
  if (ctx.plan != null && ctx.plan > 0 && (ctx.stats.median ?? 0) > ctx.plan) {
    return `Investigate reducing median ${opName} toward the ${ctx.plan} day planning assumption`;
  }
  return `Investigate ${opName} and the handoffs that drive it`;
};

export const PLAYBOOKS: Record<StepType, StepTypePlaybook> = {
  procurement: {
    diagnosis: {
      long_tail:
        "A handful of long-lead-time POs are pulling the tail out; check whether supplier performance, PO cadence, or disruption events explain the tail before treating it as the typical lead time.",
      tight_high_median:
        "Lead times cluster tightly around a high median, which is consistent with a structural supplier lead time or MOQ-driven cadence rather than random variation.",
      worsening:
        "Procurement lead times are getting worse versus the previous period; test whether supplier performance, lane mix, or purchasing cadence changed.",
      improving:
        "Procurement lead times are improving versus the previous period; confirm the gain is structural (new supplier, contract change) before locking in tighter planning assumptions.",
      mixed:
        "The opportunity is mixed: separate base lead time from supplier OTIF exceptions before recommending an action.",
    },
    dwellSummaryLead: () =>
      "Investigate supplier OTIF, minimum order quantities, and procurement strategy.",
    planningSummaryLead: () =>
      "Align planned delivery time with the supplier's actual delivery profile.",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Check the supplier and PO lines behind the longest observations.",
      },
      {
        kind: "evidence",
        text: "Compare observed lead time to the planned lead time and any supplier-quoted lead time.",
      },
      {
        kind: "evidence",
        text: "Pull supplier OTIF for the top contributors and check whether one or two suppliers explain the tail.",
      },
      {
        kind: "process",
        text: "Inspect receipt-to-warehouse posting delay (system posting date vs. physical receipt) to rule out paperwork lag.",
      },
      {
        kind: "policy",
        text: "Review MOQ, frame-contract, or VMI options where high-volume materials show repeatable lead-time pressure.",
      },
      {
        kind: "planning",
        text: "Validate whether the planning assumption protects the appropriate service level given observed variability.",
      },
    ],
  },

  raw_material_dwell: {
    diagnosis: {
      long_tail:
        "A few batches sit for very long; check whether safety-stock excess, quarantine holds, expiry, or early call-offs explain the tail.",
      tight_high_median:
        "Raw materials consistently sit for a similar period, which is consistent with safety-stock policy or supplier delivery cadence setting the floor.",
      worsening:
        "Raw material dwell is rising versus the previous period; check whether replenishment cadence is out of sync with consumption.",
      improving:
        "Raw material dwell is improving; confirm it is not driven by stockouts before reducing safety days.",
      mixed:
        "The picture is mixed: separate chronic high-stock materials from episodic over-deliveries before deciding on action.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "raw-material dwell"),
    planningSummaryLead: () =>
      "Calibrate MRP reorder point and safety days against actual consumption rate.",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Inspect the oldest receipts and the consumption dates they eventually served.",
      },
      {
        kind: "evidence",
        text: "Check whether quarantine, expiry, or FEFO/FIFO practice explains the longest holds.",
      },
      {
        kind: "policy",
        text: "Review safety stock, reorder-point policy, and supplier MOQ for the highest-dwell materials.",
      },
      {
        kind: "process",
        text: "Check call-off cadence and whether deliveries arrive in larger lots than consumption justifies.",
      },
      {
        kind: "planning",
        text: "Compare observed dwell to the MRP horizon, safety days, and actual consumption rate.",
      },
    ],
  },

  intermediate_dwell: {
    diagnosis: {
      long_tail:
        "Some intermediate batches wait far longer than typical; check whether batch-size mismatch, campaign timing, or scheduling changes explain the tail.",
      tight_high_median:
        "Intermediate dwell is consistent and elevated, which is consistent with a structural buffer, sequencing issue, or workaround for production capacity constraints.",
      worsening:
        "Intermediate dwell is rising; check whether upstream production is running ahead of downstream demand or whether downstream sequencing has changed.",
      improving:
        "Intermediate dwell is improving; confirm whether sequencing changes or batch-size adjustments are sustainable.",
      mixed:
        "The picture is mixed: look at whether elevated dwell is concentrated in particular batches or production campaigns before recommending an action.",
    },
    dwellSummaryLead: (ctx) =>
      DWELL_PLAN_LEAD(ctx, "intermediate-stage WIP dwell"),
    planningSummaryLead: () =>
      "Re-examine the planned buffer between the upstream and downstream production steps",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Compare upstream and downstream batch sizes for the affected intermediates.",
      },
      {
        kind: "evidence",
        text: "Check whether long waits cluster around specific campaigns, equipment, or scheduling rules.",
      },
      {
        kind: "process",
        text: "Review production sequencing to determine whether the next step is starved, equipment-bound, or waiting on material.",
      },
      {
        kind: "process",
        text: "Inspect equipment occupancy to test whether dwell is a symptom of a downstream bottleneck.",
      },
      {
        kind: "planning",
        text: "Confirm the WIP buffer assumption reflects actual upstream/downstream linkage and campaign constraints.",
      },
    ],
  },

  production: {
    diagnosis: {
      long_tail:
        "A few orders take far longer than the typical campaign; check whether extended changeovers, equipment unavailability, or low-yield runs explain those events.",
      tight_high_median:
        "Production runs cluster around a high duration, which is consistent with planned production time or campaign structure setting the floor.",
      worsening:
        "Production duration is increasing; check changeovers, OEE, and whether a specific line or product mix is degrading.",
      improving:
        "Production duration is improving; confirm whether the improvement is driven by mix, OEE, or a one-off and whether it is sustainable.",
      mixed:
        "Separate steady-state run time from changeover-heavy or low-yield campaigns before drawing conclusions.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "production duration"),
    planningSummaryLead: () =>
      "Re-calibrate the planned production time against actual run time",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Review orders with the longest normalized durations and their changeover context.",
      },
      {
        kind: "evidence",
        text: "Check OEE, downtime, speed-loss, quality-loss, and material-availability data for the relevant line.",
      },
      {
        kind: "process",
        text: "Inspect changeover patterns and campaign sizing to identify whether the bottleneck is consistent or shifting.",
      },
      {
        kind: "planning",
        text: "Compare actual duration and yield variance to the planned production time.",
      },
    ],
  },

  qa_hold: {
    diagnosis: {
      long_tail:
        "A few batches sit in QA hold far longer than typical; check whether retests, off-spec investigations, method cycle time, or regulatory holds explain those events.",
      tight_high_median:
        "QA hold time is consistent and elevated, which is consistent with analytical cycle time or lab batching setting the floor.",
      worsening:
        "QA hold times are rising; check lab throughput, sample backlog, retest rate, and whether testing methods have changed.",
      improving:
        "QA hold times are improving; confirm whether faster analytical methods or reduced retest rates are sustainable.",
      mixed:
        "Identify whether elevated hold time is driven by sample batching, retests, or specific test methods before acting.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "QA hold time"),
    planningSummaryLead: () =>
      "Update the planned QA lead time per material to reflect actual analytical cycle time",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Check batches with the longest release delays for retests, investigations, or specific test methods.",
      },
      {
        kind: "evidence",
        text: "Review lab queue, method cycle time, and retest rate for the material.",
      },
      {
        kind: "process",
        text: "Identify whether sample batching, throughput constraints, regulatory holds, or stability-test holds apply to specific batches.",
      },
      {
        kind: "planning",
        text: "Calibrate QA lead time per material against observed high-percentile timing and required release commitments.",
      },
    ],
  },

  post_qa_ship: {
    diagnosis: {
      long_tail:
        "A few batches wait far longer to ship than typical; check whether container fill, customer call-off, or freight cadence explains the lane-specific tail.",
      tight_high_median:
        "Post-QA dwell is consistent and elevated, which is consistent with a structural shipping cadence such as weekly containers or full-truckload thresholds.",
      worsening:
        "Post-QA dwell is rising; check container fill rules, freight booking lead time, and customer call-off behaviour.",
      improving:
        "Post-QA dwell is improving; confirm whether smaller containers, more frequent shipments, or mix changes explain it.",
      mixed:
        "Distinguish dwell that is intentional (container fill) from dwell that is avoidable (booking delays) before acting.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "post-QA dwell"),
    planningSummaryLead: () =>
      "Update planned shipping lead time to reflect actual container-fill and booking cadence",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Inspect batches with long QA-release-to-shipment gaps by customer or lane.",
      },
      {
        kind: "evidence",
        text: "Check freight cadence, customer call-off behaviour, container-fill rules, and forwarder booking lead time for the dominant lanes.",
      },
      {
        kind: "process",
        text: "Inspect staging, label rework, physical handling, and goods-issue posting lag after QA release.",
      },
      {
        kind: "planning",
        text: "Compare planned shipping lead time to observed median and P95 before deciding whether the lever is operational change or planning calibration.",
      },
    ],
  },

  transit: {
    diagnosis: {
      long_tail:
        "A few shipments take far longer than typical; check whether customs holds, demurrage, carrier performance, or a specific lane explains those events.",
      tight_high_median:
        "Transit time is consistent and elevated, which is consistent with lane structure, mode, or route setting the floor.",
      worsening:
        "Transit time is rising; check carrier performance, customs hold rate, and whether the lane mix has changed.",
      improving:
        "Transit time is improving; confirm whether the gain is from a carrier change, mode mix, or favourable customs cycle.",
      mixed:
        "Identify whether elevated transit is structural to a lane or driven by exception events before acting.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "transit time"),
    planningSummaryLead: () =>
      "Align planned transit time per lane with carrier-actual performance",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Break long transit observations down by lane, carrier, customs status, and port/terminal delays.",
      },
      {
        kind: "evidence",
        text: "Check whether the apparent trend is route mix or true carrier performance.",
      },
      {
        kind: "process",
        text: "Inspect booking and customs documentation handoffs for internal delays.",
      },
      {
        kind: "policy",
        text: "Confirm incoterms and ownership of dwell time at customs.",
      },
      {
        kind: "planning",
        text: "Calibrate planned transit time per lane against observed high-percentile timing and actual shipment routing.",
      },
    ],
  },

  destination_dwell: {
    diagnosis: {
      long_tail:
        "A few hub stockholdings persist far longer than typical; check whether slow-moving SKUs, hub allocation, or customer pull that did not materialise explain the tail.",
      tight_high_median:
        "Hub dwell is consistent and elevated, which is consistent with hub stocking policy or days-of-cover setting the floor.",
      worsening:
        "Hub dwell is rising; check whether customer call-off is slowing or whether hub allocation has been over-provisioned.",
      improving:
        "Hub dwell is improving; confirm whether hub stocking has been right-sized or whether customer demand has shifted.",
      mixed:
        "Separate stuck SKUs from healthy stock turn before recommending policy changes.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "hub dwell"),
    planningSummaryLead: () =>
      "Align hub stocking days-of-cover with the actual customer call-off cadence",
    recommendedActions: [
      {
        kind: "evidence",
        text: "Identify whether aged hub stock is concentrated in a few SKUs, customers, or allocation decisions.",
      },
      {
        kind: "evidence",
        text: "Compare hub allocation to actual customer call-off cadence.",
      },
      {
        kind: "process",
        text: "Inspect local repackaging, rework time, and route reassignment options at the hub.",
      },
      {
        kind: "policy",
        text: "Review whether minimum stocking levels remain aligned with the current demand profile.",
      },
      {
        kind: "planning",
        text: "Compare planned days-of-cover to observed hub dwell and validate whether the model treats hub stock as a service buffer or pull-driven inventory.",
      },
    ],
  },
};

export function diagnosisFor(
  stepType: StepType,
  signals: ShapeSignal[],
): string[] {
  const playbook = PLAYBOOKS[stepType];

  const seen = new Set<ShapeSignal>();
  const out: string[] = [];
  for (const signal of signals) {
    if (seen.has(signal)) {
      continue;
    }
    seen.add(signal);
    const sentence = playbook.diagnosis[signal];
    if (sentence) {
      out.push(sentence);
    }
  }
  return out;
}
