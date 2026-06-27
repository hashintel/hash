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

export interface NextStepsChecklist {
  scm: string[];
  opex: string[];
  planning: string[];
}

export interface StepTypePlaybook {
  /** Maps a shape signal to a sentence tailored to this step type. */
  diagnosis: Record<ShapeSignal, string>;
  /** Lead clause for the dwell brief summary; gets combined with numeric target. */
  dwellSummaryLead: (ctx: PlaybookContext) => string;
  /** Lead clause for the planning brief summary; gets combined with numeric target. */
  planningSummaryLead: (ctx: PlaybookContext) => string;
  /** Three buckets of recommended next steps shown at the end of the brief. */
  nextSteps: NextStepsChecklist;
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
  if (median >= 3 && median > 0 && (p75 - p25) / median < 0.35) {
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
        "A handful of long-lead-time POs are pulling the tail out — most likely supplier OTIF issues or single-source disruptions rather than the typical lead time.",
      tight_high_median:
        "Lead times cluster tightly around a high median, which usually indicates a structural supplier lead time or MOQ-driven cadence rather than episodic delays.",
      worsening:
        "Procurement lead times are getting worse versus the previous period; check whether a specific supplier, lane, or material category is degrading.",
      improving:
        "Procurement lead times are improving versus the previous period; confirm the gain is structural (new supplier, contract change) before locking in tighter planning assumptions.",
      mixed:
        "The opportunity is mixed: separate base lead time from supplier OTIF exceptions before recommending an action.",
    },
    dwellSummaryLead: () =>
      "Investigate supplier OTIF, frame-contract MOQs, and whether dual-sourcing could shorten lead time",
    planningSummaryLead: () =>
      "Align planned delivery time with the supplier's actual delivery profile",
    nextSteps: {
      scm: [
        "Pull supplier OTIF for the top contributors and check whether one or two suppliers explain the tail.",
        "Review MOQ vs. lead time trade-offs: a smaller MOQ with more frequent deliveries could reduce dwell upstream.",
        "Check whether frame contracts or VMI arrangements could shrink the planning buffer for high-volume materials.",
      ],

      opex: [
        "Inspect receipt-to-warehouse posting delay (system posting date vs. physical receipt) — paperwork lag can inflate apparent lead time.",
        "Confirm the material booking process at goods receipt is not adding avoidable days.",
      ],

      planning: [
        "Compare observed lead time to the planned lead time and supplier-quoted lead time; identify gaps.",
        "Validate whether the planning assumption protects the appropriate service level given variability.",
      ],
    },
  },

  raw_material_dwell: {
    diagnosis: {
      long_tail:
        "A few batches sit for very long — likely safety-stock excess, expired quarantine holds, or call-offs that arrived ahead of plan.",
      tight_high_median:
        "Raw materials consistently sit for a similar period, suggesting safety-stock policy or supplier delivery cadence sets the floor — not random variability.",
      worsening:
        "Raw material dwell is rising versus the previous period; check whether replenishment cadence is out of sync with consumption.",
      improving:
        "Raw material dwell is improving; confirm it is not driven by stockouts before reducing safety days.",
      mixed:
        "Separate chronic high-stock materials from episodic over-deliveries before deciding where to push.",
    },
    dwellSummaryLead: (ctx) => DWELL_PLAN_LEAD(ctx, "raw-material dwell"),
    planningSummaryLead: () =>
      "Calibrate MRP reorder point and safety days against actual consumption rate",
    nextSteps: {
      scm: [
        "Review safety stock and reorder-point policy for the highest-dwell materials.",
        "Check call-off cadence: are deliveries arriving in larger lots than consumption justifies?",
        "Confirm supplier MOQ is not the constraint forcing oversized batches.",
      ],

      opex: [
        "Check for quarantine holds or expiry-driven quarantine that inflate dwell on specific batches.",
        "Review whether FEFO/FIFO is being followed at consumption.",
      ],

      planning: [
        "Compare observed dwell to MRP horizon and safety days; identify materials where MRP is over-stocking.",
        "Validate planned consumption rate against actual; mismatched rates over-inflate buffer.",
      ],
    },
  },

  intermediate_dwell: {
    diagnosis: {
      long_tail:
        "Intermediate batches that wait far longer than typical usually point to batch-size mismatch — upstream is producing in larger lots than downstream can consume.",
      tight_high_median:
        "Intermediate dwell is consistent and elevated, which usually indicates a structural WIP buffer between two scheduling cadences.",
      worsening:
        "Intermediate dwell is rising; check whether upstream production is running ahead of downstream demand or whether downstream sequencing has changed.",
      improving:
        "Intermediate dwell is improving; confirm whether sequencing changes or batch-size adjustments are sustainable.",
      mixed:
        "Look at whether elevated dwell is concentrated in particular batches or production campaigns before recommending an action.",
    },
    dwellSummaryLead: (ctx) =>
      DWELL_PLAN_LEAD(ctx, "intermediate-stage WIP dwell"),
    planningSummaryLead: () =>
      "Re-examine the planned WIP buffer between the upstream and downstream production steps",
    nextSteps: {
      scm: [
        "Check whether scheduling rules force intermediate stocking above what the next step needs.",
      ],

      opex: [
        "Compare upstream and downstream batch sizes — a mismatch is the most common cause of intermediate dwell.",
        "Review production scheduling and sequencing: is the next step starved or waiting on equipment, not material?",
        "Inspect equipment occupancy to confirm dwell is not a symptom of a downstream bottleneck.",
      ],

      planning: [
        "Confirm the WIP buffer assumption in the production plan reflects actual upstream/downstream linkage.",
        "Check whether changeovers or campaign sequencing imply a buffer that could be reduced.",
      ],
    },
  },

  production: {
    diagnosis: {
      long_tail:
        "A few orders take far longer than the typical campaign — most often driven by extended changeovers, equipment unavailability, or a few low-yield runs.",
      tight_high_median:
        "Production runs cluster around a high duration, suggesting the planned production time is the floor rather than random variation.",
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
    nextSteps: {
      scm: [
        "Check whether material availability is causing the tail (raw material stockouts mid-run).",
      ],

      opex: [
        "Inspect changeover patterns: are campaign sizes minimising changeovers?",
        "Review cycle time and line utilisation; identify whether the bottleneck is consistent or shifting.",
        "Check OEE for the production line and whether quality losses, breakdowns, or speed losses are dominant.",
      ],

      planning: [
        "Compare actual run time to the planned production time.",
        "Confirm planned versus actual yield — under-yield extends effective production duration per batch.",
      ],
    },
  },

  qa_hold: {
    diagnosis: {
      long_tail:
        "A few batches sit in QA hold far longer than typical — typically driven by retests, off-spec investigations, or regulatory holds on specific materials.",
      tight_high_median:
        "QA hold time is consistent and elevated, suggesting standard analytical cycle time and lab batching, not exceptions, set the floor.",
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
    nextSteps: {
      scm: [
        "Confirm whether customer release commitments accommodate the actual QA hold time.",
      ],

      opex: [
        "Review lab throughput and whether analyses are batched in a way that delays release.",
        "Check the retest rate by material — a high retest rate doubles or triples effective QA time.",
        "Identify whether any regulatory or stability-test holds apply to specific batches.",
      ],

      planning: [
        "Calibrate QA lead time per material against the observed P75/P95.",
        "Confirm the planning parameter protects the appropriate service level given retest variability.",
      ],
    },
  },

  post_qa_ship: {
    diagnosis: {
      long_tail:
        "A few batches wait far longer to ship than typical — most often driven by container fill, customer call-off, or freight cadence on specific lanes.",
      tight_high_median:
        "Post-QA dwell is consistent and elevated, suggesting a structural shipping cadence (weekly container, full-truckload threshold) is the driver.",
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
    nextSteps: {
      scm: [
        "Review container fill strategy — is dwell intentional while building a full container?",
        "Check freight cadence and customer call-off behaviour for the dominant lanes.",
        "Confirm booking lead time at the forwarder allows for the observed dwell.",
      ],

      opex: [
        "Inspect staging, label rework, and any physical handling after QA release.",
        "Confirm the system goods-issue posting date matches physical gate-out — paperwork lag inflates apparent dwell.",
      ],

      planning: [
        "Compare planned shipping lead time to observed median and P95.",
        "Decide whether dwell reduction is a planning calibration issue or an operational change.",
      ],
    },
  },

  transit: {
    diagnosis: {
      long_tail:
        "A few shipments take far longer than typical — usually customs holds, demurrage, or a single problematic lane.",
      tight_high_median:
        "Transit time is consistent and elevated, suggesting the lane structure (mode, route) — not exceptions — is the driver.",
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
    nextSteps: {
      scm: [
        "Pull carrier performance for the dominant lanes and check whether one or two carriers explain the tail.",
        "Review the customs hold rate by lane; investigate causes for any lane with persistent holds.",
        "Confirm incoterms and ownership of dwell time at customs — internal vs. customer-managed.",
      ],

      opex: [
        "Inspect paperwork handoffs (booking, customs documentation) — internal delays add to transit time.",
      ],

      planning: [
        "Calibrate planned transit time per lane against observed P75/P95.",
        "Confirm the lane mix in the plan matches actual shipment routing.",
      ],
    },
  },

  destination_dwell: {
    diagnosis: {
      long_tail:
        "A few hub stockholdings persist far longer than typical — usually slow-moving SKUs or customer pull that did not materialise.",
      tight_high_median:
        "Hub dwell is consistent and elevated, suggesting the hub stocking policy (days-of-cover) sets the floor, not exception events.",
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
    nextSteps: {
      scm: [
        "Review hub allocation policy: are units pushed to the hub ahead of confirmed customer call-off?",
        "Check whether route reassignment between hubs could clear slow-moving stock.",
        "Confirm minimum stocking levels at the hub are aligned with current demand profile.",
      ],

      opex: [
        "Inspect local repackaging or rework time at the hub.",
        "Identify any SKUs whose hub dwell is dominated by aged stock.",
      ],

      planning: [
        "Compare planned days-of-cover to observed P75 at the hub.",
        "Validate whether the planning model treats hub stock as a service buffer or as a pull-driven inventory.",
      ],
    },
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

const FIRST_EVIDENCE_BY_STEP_TYPE: Record<StepType, string[]> = {
  procurement: [
    "Check the supplier and PO lines behind the longest observations.",
    "Compare observed lead time to the planned lead time and any supplier-quoted lead time.",
    "Look for one vendor, material, or purchasing cadence explaining the tail.",
  ],

  raw_material_dwell: [
    "Inspect the oldest receipts and the consumption dates they eventually served.",
    "Check safety-stock and reorder-point settings for the material.",
    "Validate whether quarantine, expiry, or FEFO/FIFO practice explains long holds.",
  ],

  intermediate_dwell: [
    "Compare upstream and downstream batch sizes for the affected intermediates.",
    "Check whether long waits cluster around specific campaigns or equipment.",
    "Validate whether downstream sequencing or capacity is the binding constraint.",
  ],

  production: [
    "Review orders with the longest normalized durations and their changeover context.",
    "Check OEE, downtime, and speed-loss data for the relevant line.",
    "Compare actual duration to the planned production time and yield variance.",
  ],

  qa_hold: [
    "Check batches with the longest release delays for retests or investigations.",
    "Review lab queue and method cycle time for the material.",
    "Confirm whether holds are regulatory/stability requirements or avoidable waits.",
  ],

  post_qa_ship: [
    "Inspect batches with long QA-release-to-shipment gaps by customer or lane.",
    "Check freight booking and container-fill rules for the dominant route.",
    "Validate whether the system goods-issue posting date matches physical gate-out.",
  ],

  transit: [
    "Break long transit observations down by lane, carrier, and customs status.",
    "Check whether the apparent trend is route mix or true carrier performance.",
    "Review documentation handoffs for customs or demurrage delays.",
  ],

  destination_dwell: [
    "Identify whether aged hub stock is concentrated in a few SKUs or customers.",
    "Compare hub allocation to actual customer call-off cadence.",
    "Check whether stock was pushed ahead of confirmed demand.",
  ],
};
export function firstEvidenceFor(stepType: StepType): string[] {
  return FIRST_EVIDENCE_BY_STEP_TYPE[stepType];
}
