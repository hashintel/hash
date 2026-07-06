import { DWELL_TYPES } from "./categories";
import {
  bucketKgDaysForCategories,
  CARRY_CATEGORY_KEYS,
  type CarryCategoryKey,
  computePeriodCost,
  FG_INTERMEDIATE_CARRY_CATEGORIES,
  NODE_CARRY_CATEGORIES,
} from "./cost";
import { type BaseMeasure, selectStat } from "./measure-context";
import { computeStats } from "./stats";

import type {
  MonthlyBucket,
  SiteData,
  SiteNode,
  GraphNode,
  StepStats,
} from "./types";

const SHARED_STEP_TYPES = new Set(["raw_material_dwell", "procurement"]);

function normaliseLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function fingerprintValue(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toPrecision(12) : "nan";
  }
  return value ?? "null";
}

function costFingerprint(
  unitPrice: number | null | undefined,
  currency: string | null | undefined,
): string {
  return [unitPrice, currency].map(fingerprintValue).join(":");
}

function monthlyFingerprint(monthly: MonthlyBucket[] | undefined): string {
  if (!monthly || monthly.length === 0) {
    return "no-monthly";
  }
  return monthly
    .map((month) =>
      [
        month.month,
        month.n,
        month.total_kg_days,
        month.consumed_kg_days,
        month.dispatched_kg_days,
        month.other_exit_kg_days,
        month.open_kg_days,
        month.mean,
        month.median,
      ]
        .map(fingerprintValue)
        .join(":"),
    )
    .join(";");
}

function statsFingerprint(stats: StepStats): string {
  return [
    stats.n,
    stats.mean,
    stats.median,
    stats.std,
    stats.min,
    stats.max,
    stats.p25,
    stats.p75,
    stats.p85,
    stats.p95,
  ]
    .map(fingerprintValue)
    .join(",");
}

function dwellSeriesFingerprint(node: GraphNode): string {
  return [
    statsFingerprint(node.stats),
    monthlyFingerprint(node.monthly),
    costFingerprint(node.cost?.unit_price, node.cost?.currency),
  ].join("~");
}

function dwellDedupKey(node: GraphNode, productId: string): string {
  // Raw-material and intermediate dwell describe a material's carrying cost at a
  // plant, not a per-product quantity, so a given (material, plant) is the same
  // dwell regardless of which finished good's graph it appears in. Key on the
  // material alone so the shared row merges into one entry with all consuming products as tags.
  if (
    (node.type === "raw_material_dwell" ||
      node.type === "intermediate_dwell") &&
    node.material
  ) {
    return ["dwell-material", node.plant, node.type, node.material].join("|");
  }
  const series = dwellSeriesFingerprint(node);
  if (node.material) {
    return ["dwell", node.plant, node.type, node.material, series].join("|");
  }
  return [
    "dwell",
    node.plant,
    node.type,
    normaliseLabel(node.label),
    series || productId,
  ].join("|");
}
function dedupKey(node: GraphNode, productId: string): string {
  if (DWELL_TYPES.includes(node.type)) {
    return dwellDedupKey(node, productId);
  }
  if (SHARED_STEP_TYPES.has(node.type) && node.material) {
    return ["shared", node.material, node.plant, node.type].join("|");
  }
  return ["product", productId, node.id, node.plant, node.type].join("|");
}

function aggregateMonthlyBuckets(nodes: GraphNode[]): MonthlyBucket[] {
  const observationsByMonth = new Map<string, number[]>();
  const splitByMonth = new Map<string, Record<CarryCategoryKey, number>>();
  const totalByMonth = new Map<string, number>();
  // Whether any merged bucket carried the exit-typed split. Legacy / fallback
  // nodes ship only `total_kg_days`; for those we must NOT emit a (zeroed) split
  // or the attribution stamp would read it as "split present" and zero the cost.
  let sawSplit = false;

  const zeroSplit = (): Record<CarryCategoryKey, number> => ({
    consumed_kg_days: 0,
    dispatched_kg_days: 0,
    other_exit_kg_days: 0,
    open_kg_days: 0,
  });

  for (const node of nodes) {
    for (const observation of node.observations ?? []) {
      const month = observation.date.slice(0, 7);
      const values = observationsByMonth.get(month);
      if (values) {
        values.push(observation.value);
      } else {
        observationsByMonth.set(month, [observation.value]);
      }
    }
    for (const bucket of node.monthly ?? []) {
      const split = splitByMonth.get(bucket.month) ?? zeroSplit();
      for (const key of CARRY_CATEGORY_KEYS) {
        const value = bucket[key];
        if (typeof value === "number") {
          sawSplit = true;
          split[key] += value;
        }
      }
      splitByMonth.set(bucket.month, split);
      totalByMonth.set(
        bucket.month,
        (totalByMonth.get(bucket.month) ?? 0) + (bucket.total_kg_days ?? 0),
      );
    }
  }

  return [...new Set([...observationsByMonth.keys(), ...totalByMonth.keys()])]
    .sort()
    .map((month) => {
      const values = observationsByMonth.get(month) ?? [];
      const stats = computeStats(values);
      const bucket: MonthlyBucket = {
        month,
        mean: values.length > 0 ? stats.mean : null,
        median: values.length > 0 ? stats.median : null,
        n: values.length > 0 ? stats.n : 0,
        total_kg_days: totalByMonth.get(month) ?? 0,
      };
      if (sawSplit) {
        Object.assign(bucket, splitByMonth.get(month) ?? zeroSplit());
      }
      return bucket;
    });
}

function aggregateRawMaterialDwellNodes(nodes: GraphNode[]): GraphNode {
  const uniqueSeries = new Map<string, GraphNode>();
  for (const node of nodes) {
    uniqueSeries.set(dwellSeriesFingerprint(node), node);
  }
  const uniqueNodes = [...uniqueSeries.values()];
  if (uniqueNodes.length === 1) {
    return uniqueNodes[0]!;
  }

  const observations = uniqueNodes.flatMap((node) => node.observations ?? []);
  const stats = computeStats(
    observations.map((observation) => observation.value),
  );
  return {
    ...uniqueNodes[0]!,
    observations,
    monthly: aggregateMonthlyBuckets(uniqueNodes),
    stats,
    pct_exceeding_plan: null,
  };
}

/**
 * The exit-typed carry buckets a node owns at the site level. An
 * `intermediate_dwell` for a material that is ALSO a directly-sold finished good
 * (i.e. it has a post-QA node at the site) owns only its consumed carry -- its
 * dispatched + open carry is booked on that post-QA node -- so the two nodes sum
 * without double counting. A pure intermediate owns all four buckets.
 */
function carryCategoriesForNode(
  node: GraphNode,
  fgIntermediateMaterials: Set<string>,
): readonly CarryCategoryKey[] {
  if (node.type === "intermediate_dwell") {
    return node.material && fgIntermediateMaterials.has(node.material)
      ? FG_INTERMEDIATE_CARRY_CATEGORIES
      : CARRY_CATEGORY_KEYS;
  }
  return NODE_CARRY_CATEGORIES[node.type] ?? CARRY_CATEGORY_KEYS;
}

/**
 * Stamp each dwell node's `total_kg_days` to the exit-typed split it owns, so
 * every downstream cost consumer (period cost, monthly chart, trends) reads a
 * single attributed carry number without knowing the split rules.
 */
function stampAttributedKgDays(
  node: SiteNode,
  fgIntermediateMaterials: Set<string>,
): SiteNode {
  if (!DWELL_TYPES.includes(node.type) || !node.monthly) {
    return node;
  }
  const categories = carryCategoriesForNode(node, fgIntermediateMaterials);
  return {
    ...node,
    monthly: node.monthly.map((bucket) => ({
      ...bucket,
      total_kg_days: bucketKgDaysForCategories(bucket, categories),
    })),
  };
}

export function deduplicateNodes(siteData: SiteData): SiteNode[] {
  const grouped = new Map<
    string,
    {
      nodes: GraphNode[];
      products: Array<{ id: string; name: string }>;
    }
  >();

  for (const { product, graph } of siteData.graphs) {
    for (const node of graph.nodes) {
      const key = dedupKey(node, product.id);
      const existing = grouped.get(key);
      if (existing) {
        existing.nodes.push(node);
        if (!existing.products.some((product2) => product2.id === product.id)) {
          existing.products.push({ id: product.id, name: product.name });
        }
      } else {
        grouped.set(key, {
          nodes: [node],
          products: [{ id: product.id, name: product.name }],
        });
      }
    }
  }

  const merged: SiteNode[] = Array.from(grouped.values()).map(
    ({ nodes, products }) => {
      const node =
        nodes[0]?.type === "raw_material_dwell"
          ? aggregateRawMaterialDwellNodes(nodes)
          : nodes[0]!;
      return {
        ...node,
        products,
      };
    },
  );

  // Materials that are directly-sold finished goods (they have a post-QA node)
  // so their intermediate dwell keeps only consumed carry (dispatched + open is
  // attributed to the post-QA node), avoiding double counting when both nodes
  // exist for the same material at the site.
  const fgIntermediateMaterials = new Set(
    merged
      .filter((node) => node.type === "post_qa_ship" && node.material)
      .map((node) => node.material as string),
  );

  return merged.map((node) =>
    stampAttributedKgDays(node, fgIntermediateMaterials),
  );
}

export function computeNodePeriodCost(
  node: SiteNode,
  waccRate: number,
  storageCost: number,
): number {
  return computePeriodCost(
    node.monthly,
    node.cost?.unit_price,
    waccRate,
    storageCost,
  );
}

export function totalSiteDwellCost(
  nodes: SiteNode[],
  waccRate: number,
  storageCost: number,
): number {
  return nodes
    .filter((count) => DWELL_TYPES.includes(count.type) && count.stats.n > 0)
    .reduce(
      (acc, count) => acc + computeNodePeriodCost(count, waccRate, storageCost),
      0,
    );
}

export function topDwellCosts(
  nodes: SiteNode[],
  waccRate: number,
  storageCost: number,
  count: number,
): Array<SiteNode & { periodCost: number }> {
  return nodes
    .filter((node) => DWELL_TYPES.includes(node.type) && node.stats.n > 0)
    .map((node) => ({
      ...node,
      periodCost: computeNodePeriodCost(node, waccRate, storageCost),
    }))
    .filter((node) => node.periodCost > 0)
    .sort((left, right) => right.periodCost - left.periodCost)
    .slice(0, count);
}

function planningDeviation(
  node: SiteNode,
  measure: BaseMeasure,
): number | null {
  if (node.plan == null || node.plan <= 0) {
    return null;
  }
  return (
    (((selectStat(node.stats, measure) ?? 0) - node.plan) / node.plan) * 100
  );
}

export function topPlanningMismatches(
  nodes: SiteNode[],
  count: number,
  measure: BaseMeasure = "median",
): Array<SiteNode & { deviationPct: number }> {
  return nodes
    .filter((node) => node.plan != null && node.plan > 0 && node.stats.n > 0)
    .map((node) => ({
      ...node,
      deviationPct: planningDeviation(node, measure) as number,
    }))
    .sort((left, right) => right.deviationPct - left.deviationPct)
    .slice(0, count);
}

export function countBadPlanningParams(
  nodes: SiteNode[],
  measure: BaseMeasure = "median",
): number {
  return nodes.filter((node) => {
    if (node.plan == null || node.plan <= 0 || node.stats.n === 0) {
      return false;
    }
    return (selectStat(node.stats, measure) ?? 0) > node.plan * 1.2;
  }).length;
}
