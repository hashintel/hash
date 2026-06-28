import {
  formatNextBottleneck,
  isCapActive,
  meanObservedCapReduction,
  type LeverDefinition,
} from "../whatif";

import type { GraphNode } from "../../../shared/types";

export type CaveatSeverity = "info" | "warning";

export interface Caveat {
  id: string;
  severity: CaveatSeverity;
  label: string;
  detail: string;
}

interface CaveatInputs {
  /** Map of step_id -> selected cap days. Missing/Max means uncapped. */
  capLevers: Record<string, number>;
  leverDefs: LeverDefinition[];
  nodes: GraphNode[];
}

/**
 * Generate the contextual caveats to render below the KPI tiles, based on
 * which levers the user has activated (i.e. selected a cap below Max).
 *
 * Each rule reads the active lever values + step metadata. Rules are
 * deliberately concrete and conservative -- the goal is to keep the tool
 * from over-promising for the cases we know are fragile (campaign
 * bundling, non-binding parallel paths, next-bottleneck exceedance).
 */
export function buildWhatIfCaveats({
  capLevers,
  leverDefs,
  nodes,
}: CaveatInputs): Caveat[] {
  const caveats: Caveat[] = [];
  const nodeById = new Map(nodes.map((count) => [count.id, count]));

  // A lever is active when it caps durations below the step max.
  const activeLevers = leverDefs.filter((line) => {
    return isCapActive(line, capLevers[line.stepId]);
  });

  if (activeLevers.length === 0) {
    return caveats;
  }

  for (const lever of activeLevers) {
    const capDays = capLevers[lever.stepId];
    const meanTailReduction = meanObservedCapReduction(
      nodeById.get(lever.stepId),
      capDays,
    );

    // 1. Bulk shipping cadence: post-QA dwell caps only realise if
    //    the dispatch cadence itself shifts. We fire on activation rather
    //    than at an arbitrary threshold -- the cadence dynamic exists at
    //    any cap level, varies by product/route/make-strategy, and
    //    is something the user should always be aware of when touching
    //    these levers.
    if (lever.stepType === "post_qa_ship") {
      caveats.push({
        id: `qa-cadence-${lever.stepId}`,
        severity: "info",
        label: "Bulk shipping cadence",
        detail: `Realising caps on "${lever.label}" may depend on shipping cadence/batching -- shipments often leave in campaigns, so trimming long dwell observations may not materialise unless dispatch frequency itself changes. Varies by product, route, and make-strategy.`,
      });
    }

    // 2. Next-bottleneck exceeded: once the cap's mean tail reduction is
    //    larger than the binding-chain headroom, another chain takes over
    //    and additional tail trimming on this step alone stops helping.
    if (
      lever.nextBottleneckDays != null &&
      lever.nextBottleneckDays > 0 &&
      meanTailReduction > lever.nextBottleneckDays
    ) {
      const nb = formatNextBottleneck(lever.nextBottleneckChains);
      const days = Math.round(lever.nextBottleneckDays);
      const tailDays = Math.round(meanTailReduction);
      let detail: string;
      if (nb?.mode === "single") {
        detail = `"${lever.label}" cap trims about ${tailDays}d of tail duration on average, beyond the ${days}d next-bottleneck headroom -- ${nb.text} chain becomes binding instead. Further capping on this step alone won't help unless you also tackle the next chain.`;
      } else if (nb?.mode === "mixed") {
        const phrased = nb.entries
          .map(
            (event) =>
              `${event.label} (${Math.round(event.share * 100)}% of binding batches)`,
          )
          .join(" or ");
        detail = `"${lever.label}" cap trims about ${tailDays}d of tail duration on average, beyond the ${days}d next-bottleneck headroom -- the next binding chain is typically ${phrased}. Further capping on this step alone won't help unless you also tackle the next chain.`;
      } else {
        detail = `"${lever.label}" cap trims about ${tailDays}d of tail duration on average, beyond the ${days}d next-bottleneck headroom -- further capping on this step alone yields no additional E2E saving until you also reduce the next-binding step.`;
      }
      caveats.push({
        id: `next-bottleneck-${lever.stepId}`,
        severity: "info",
        label: "Beyond next bottleneck",
        detail,
      });
    }

    // 3. Low binding share: capping a step that rarely binds is mostly
    //    inert unless paired with caps on the steps that do bind.
    if (
      lever.bindingShare > 0 &&
      lever.bindingShare < 0.4 &&
      lever.stepType !== "post_qa_ship" &&
      lever.stepType !== "transit" &&
      lever.stepType !== "destination_dwell" &&
      lever.stepType !== "production" &&
      lever.stepType !== "qa_hold"
    ) {
      caveats.push({
        id: `low-binding-${lever.stepId}`,
        severity: "info",
        label: "Low binding share",
        detail: `"${lever.label}" is binding for only ${Math.round(lever.bindingShare * 100)}% of batches. Most of the cap's value is offset by other paths still binding the E2E.`,
      });
    }
  }

  // 4. Multiple non-binding parallel upstream levers compounding
  const lowBindUpstream = activeLevers.filter(
    (line) =>
      line.bindingShare < 0.5 &&
      (line.stepType === "intermediate_dwell" ||
        line.stepType === "production"),
  );
  if (lowBindUpstream.length >= 2) {
    caveats.push({
      id: "multi-non-binding",
      severity: "warning",
      label: "Multiple non-binding parallel paths",
      detail:
        "Several upstream levers act on steps that rarely bind individually. They only compound the E2E saving once their combined capped tail mass changes the binding-chain length -- the curve is non-linear and the headline number is an upper bound.",
    });
  }

  // 5. Production capacity caveat -- only relevant when the user is
  //    touching a step whose freed time would have to be re-absorbed by
  //    production scheduling (FG / upstream production runs, or
  //    intermediate dwell, where shorter dwell means an earlier
  //    downstream production order). Skip for purely post-production
  //    levers (QA hold, shipping, transit, destination dwell) where
  //    production-asset availability isn't the constraint.
  const PROD_CAPACITY_TYPES = new Set<LeverDefinition["stepType"]>([
    "production",
    "intermediate_dwell",
  ]);
  if (activeLevers.some((line) => PROD_CAPACITY_TYPES.has(line.stepType))) {
    caveats.push({
      id: "capacity-not-modelled",
      severity: "info",
      label: "Production capacity not modelled",
      detail:
        "Caps on production / intermediate-dwell steps assume freed time can be re-absorbed by the production schedule. No assumption is made about asset availability, campaign re-planning, or buffer rules.",
    });
  }

  return caveats;
}
