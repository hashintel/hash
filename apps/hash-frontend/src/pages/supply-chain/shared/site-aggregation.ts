import { DWELL_TYPES } from "./categories";
import { computePeriodCost } from "./cost";
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
      [month.month, month.n, month.total_kg_days, month.mean, month.median]
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
  if (node.type === "raw_material_dwell" && node.material) {
    return ["raw-dwell", node.plant, node.type, node.material].join("|");
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
  const kgDaysByMonth = new Map<string, number>();

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
      kgDaysByMonth.set(
        bucket.month,
        (kgDaysByMonth.get(bucket.month) ?? 0) + (bucket.total_kg_days ?? 0),
      );
    }
  }

  return [...new Set([...observationsByMonth.keys(), ...kgDaysByMonth.keys()])]
    .sort()
    .map((month) => {
      const values = observationsByMonth.get(month) ?? [];
      const stats = computeStats(values);
      return {
        month,
        mean: values.length > 0 ? stats.mean : null,
        median: values.length > 0 ? stats.median : null,
        n: values.length > 0 ? stats.n : 0,
        total_kg_days: kgDaysByMonth.get(month) ?? 0,
      };
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

  return Array.from(grouped.values()).map(({ nodes, products }) => {
    const node =
      nodes[0]?.type === "raw_material_dwell"
        ? aggregateRawMaterialDwellNodes(nodes)
        : nodes[0]!;
    return {
      ...node,
      products,
    };
  });
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
