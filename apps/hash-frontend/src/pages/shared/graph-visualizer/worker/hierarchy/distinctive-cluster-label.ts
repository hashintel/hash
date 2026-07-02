/**
 * Name a set of sibling clusters by their distinctive shared features.
 *
 * Given clusters that are already grouped (by embeddings or a grouping fallback),
 * this finds a meaningful label for each group from the features its members share
 * but its siblings don't. Features come from three sources:
 *
 * - exact `(property = value)` pairs (e.g. `Destination = "foo"`),
 * - numeric/date ranges (e.g. `Quantity 100-500`), bucketed per-subdivision from
 *   the live distribution of the siblings, and
 * - link target types (e.g. `→ Material`).
 *
 * Scoring is coverage * IDF: a feature must be common within the cluster (coverage
 * >= {@link MIN_COVERAGE}) and rare across siblings (high IDF). Features are grouped
 * by a dedup key so a compound label never repeats a dimension.
 *
 * Collision breaking has two stages: first, extend colliding labels with the next
 * most distinctive feature; then, when characteristic features are exhausted, separate
 * on the feature where the groups most differ. Genuinely indistinguishable groups
 * share a name.
 *
 * Cost is bounded: clusters above {@link MAX_SAMPLE_MEMBERS} are named from a
 * deterministic, evenly-spread sample. Labels render in deterministic sort order.
 */
import type { ClusterId, EntityIndex } from "../../ids";

export interface ClusterMembers {
  readonly childId: ClusterId;
  readonly memberIdxs: Int32Array;
}

export interface FeatureDescriptor {
  /** Dedup group: at most one part per group appears in a compound label. */
  readonly group: string;
  /** Rendered label line, e.g. `Destination = "foo"`, `Quantity 100-500`, `→ Material`. */
  readonly text: string;
  /** Stable sort key so a multi-part label never reshuffles its lines. */
  readonly sortKey: string;
}

export interface NumericReading {
  /** Stable per-property axis key; range buckets are computed per dimension. */
  readonly dimension: string;
  /** A plain number, or a date as epoch milliseconds. */
  readonly value: number;
}

export interface NumericDimension {
  /** Dedup group, shared with the property's exact features so a property yields one part. */
  readonly group: string;
  readonly title: string;
  readonly kind: "number" | "date";
  readonly sortKey: string;
}

/**
 * Supplies per-member features for naming. The namer treats every key as
 * opaque except numeric readings, whose range bucketing it owns.
 */
export interface FeatureSource {
  /** Stable feature keys for a member (exact property + link/target-type). */
  keysOf(member: EntityIndex): Iterable<string>;
  /** Raw numeric/date readings for a member. */
  numericsOf(member: EntityIndex): Iterable<NumericReading>;
  /** Describe a key returned by {@link keysOf}, or undefined to skip it. */
  describe(key: string): FeatureDescriptor | undefined;
  /** Describe a numeric dimension, or undefined to skip it. */
  describeNumeric(dimension: string): NumericDimension | undefined;
}

/** A feature must cover at least this fraction of a cluster to be a labelling candidate. */
const MIN_COVERAGE = 0.6;
/** Most parts joined into one compound label (collision breaking). */
const MAX_LABEL_PARTS = 3;
/**
 * A discriminative tie-break feature need only be reasonably common (the groups
 * already share their dominant features, so the separator lives below MIN_COVERAGE).
 */
const DISCRIMINATOR_MIN_COVERAGE = 0.34;
/** Minimum coverage gap between this cluster and the colliding peers. */
const DISCRIMINATOR_MIN_GAP = 0.2;
/** Discriminative passes to attempt once characteristic compounding is exhausted. */
const MAX_DISCRIMINATOR_PASSES = 2;

/** Cap the members scanned per cluster; bigger clusters name from an even sample of this many. */
const MAX_SAMPLE_MEMBERS = 5000;
/**
 * A numeric axis needs at least this many distinct values across the subdivision
 * to be range-bucketed; below that, exact value features name it instead.
 */
const MIN_NUMERIC_DISTINCT = 8;

interface NumericRange {
  readonly describe: NumericDimension;
  /** Strictly-increasing interior edges; bucket b spans [edges[b-1], edges[b]). */
  readonly edges: number[];
  /** Observed [min, max] per bucket (parallel to `edges.length + 1`). */
  readonly bounds: { min: number; max: number }[];
}

interface Candidate extends FeatureDescriptor {
  readonly coverage: number;
  readonly score: number;
}

/** Deterministic, evenly-spread sample of at most `max` members. */
function subsample(members: Int32Array, max: number): Int32Array {
  if (members.length <= max) {
    return members;
  }
  const sampled = new Int32Array(max);
  for (let index = 0; index < max; index++) {
    sampled[index] = members[Math.floor((index * members.length) / max)]!;
  }
  return sampled;
}

/** Median of a non-empty ascending-sorted array. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Bucket index (0..edges.length) of a value against interior edges. */
function bucketOf(value: number, edges: number[]): number {
  let bucket = 0;
  while (bucket < edges.length && value >= edges[bucket]!) {
    bucket++;
  }
  return bucket;
}

/** Format a number compactly: integers plain, fractions to a few significant digits. */
function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US");
  }
  const magnitude = Math.abs(value);
  const fractionDigits = magnitude >= 100 ? 0 : magnitude >= 1 ? 2 : 4;
  return value.toLocaleString("en-US", {
    maximumFractionDigits: fractionDigits,
  });
}

/** Format a range bound according to its axis kind (a number, or a `YYYY-MM-DD` date). */
function formatBound(value: number, kind: "number" | "date"): string {
  if (kind === "date") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? formatNumber(value)
      : date.toISOString().slice(0, 10);
  }
  return formatNumber(value);
}

/** The descriptor for a value falling in one bucket of a numeric range. */
function rangeDescriptor(
  range: NumericRange,
  bucket: number,
): FeatureDescriptor {
  const { bounds, describe } = range;
  const { min, max } = bounds[bucket] ?? { min: NaN, max: NaN };
  let text: string;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    text = describe.title;
  } else if (min === max) {
    text = `${describe.title} ${formatBound(min, describe.kind)}`;
  } else {
    text = `${describe.title} ${formatBound(min, describe.kind)}–${formatBound(
      max,
      describe.kind,
    )}`;
  }
  return {
    group: describe.group,
    text,
    sortKey: `${describe.sortKey}\u0000${bucket}`,
  };
}

/**
 * Per-axis range buckets for the whole subdivision. Bucket edges sit at the
 * midpoints between the clusters' median values: a group split off by magnitude
 * occupies a contiguous band, so a midpoint keeps that whole band in one bucket.
 * Equal-frequency quantiles would slice the band in two and leave coverage below
 * {@link MIN_COVERAGE}.
 */
function buildNumericRanges(
  samples: readonly Int32Array[],
  source: FeatureSource,
): Map<string, NumericRange> {
  // axis -> per-cluster list of that axis's values among the cluster's sampled members.
  const valuesByAxis = new Map<string, number[][]>();
  for (let cluster = 0; cluster < samples.length; cluster++) {
    for (const member of samples[cluster]!) {
      for (const reading of source.numericsOf(member as EntityIndex)) {
        let perCluster = valuesByAxis.get(reading.dimension);
        if (!perCluster) {
          perCluster = samples.map(() => []);
          valuesByAxis.set(reading.dimension, perCluster);
        }
        perCluster[cluster]!.push(reading.value);
      }
    }
  }

  const ranges = new Map<string, NumericRange>();
  for (const [dimension, perCluster] of valuesByAxis) {
    const all = perCluster.flat().sort((left, right) => left - right);
    let distinct = all.length > 0 ? 1 : 0;
    for (let index = 1; index < all.length; index++) {
      if (all[index] !== all[index - 1]) {
        distinct++;
      }
    }
    if (distinct < MIN_NUMERIC_DISTINCT) {
      continue;
    }

    // One representative median per cluster the axis is characteristic of (covers a majority).
    const medians: number[] = [];
    for (let cluster = 0; cluster < perCluster.length; cluster++) {
      const values = perCluster[cluster]!;
      if (values.length / samples[cluster]!.length < MIN_COVERAGE) {
        continue;
      }
      medians.push(median([...values].sort((left, right) => left - right)));
    }
    const distinctMedians = [...new Set(medians)].sort(
      (left, right) => left - right,
    );
    if (distinctMedians.length < 2) {
      continue;
    }

    const describe = source.describeNumeric(dimension);
    if (!describe) {
      continue;
    }

    const edges: number[] = [];
    for (let index = 1; index < distinctMedians.length; index++) {
      edges.push((distinctMedians[index - 1]! + distinctMedians[index]!) / 2);
    }

    const bounds = Array.from({ length: edges.length + 1 }, () => ({
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    }));
    for (const value of all) {
      const bound = bounds[bucketOf(value, edges)]!;
      bound.min = Math.min(bound.min, value);
      bound.max = Math.max(bound.max, value);
    }

    ranges.set(dimension, { describe, edges, bounds });
  }
  return ranges;
}

/**
 * Coverage of every feature in one cluster (fraction of sampled members carrying it).
 * Descriptors are registered as features are first seen. Each member counts a feature
 * at most once.
 */
function clusterCoverage(
  sample: Int32Array,
  source: FeatureSource,
  ranges: Map<string, NumericRange>,
  descriptors: Map<string, FeatureDescriptor>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const size = sample.length;
  if (size === 0) {
    return counts;
  }

  for (const member of sample) {
    const seen = new Set<string>();
    for (const key of source.keysOf(member as EntityIndex)) {
      if (seen.has(key)) {
        continue;
      }
      let descriptor = descriptors.get(key);
      if (!descriptor) {
        descriptor = source.describe(key);
        if (!descriptor) {
          continue;
        }
        descriptors.set(key, descriptor);
      }
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const reading of source.numericsOf(member as EntityIndex)) {
      const range = ranges.get(reading.dimension);
      if (!range) {
        continue;
      }
      const bucket = bucketOf(reading.value, range.edges);
      const key = `range\u0000${reading.dimension}\u0000${bucket}`;
      if (seen.has(key)) {
        continue;
      }
      if (!descriptors.has(key)) {
        descriptors.set(key, rangeDescriptor(range, bucket));
      }
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  for (const [key, count] of counts) {
    counts.set(key, count / size);
  }
  return counts;
}

/**
 * Rank a cluster's distinctive candidates, keeping the best-scoring feature per
 * dedup group so a compound label never repeats a dimension.
 */
function rankCandidates(
  coverage: Map<string, number>,
  documentFrequency: Map<string, number>,
  clusterCount: number,
  descriptors: Map<string, FeatureDescriptor>,
): Candidate[] {
  const bestPerGroup = new Map<string, Candidate>();

  for (const [key, fraction] of coverage) {
    if (fraction < MIN_COVERAGE) {
      continue;
    }
    const descriptor = descriptors.get(key);
    if (!descriptor) {
      continue;
    }
    const docFreq = documentFrequency.get(key) ?? 1;
    const idf = Math.log((clusterCount + 1) / (docFreq + 1));
    const score = fraction * idf;
    if (score <= 0) {
      // Shared by every cluster (idf 0) -- carries no distinguishing signal.
      continue;
    }

    const candidate: Candidate = {
      group: descriptor.group,
      text: descriptor.text,
      sortKey: descriptor.sortKey,
      coverage: fraction,
      score,
    };
    const existing = bestPerGroup.get(descriptor.group);
    // Deterministic best-feature selection: higher score, then higher coverage, then sort key.
    if (
      !existing ||
      score > existing.score ||
      (score === existing.score &&
        (fraction > existing.coverage ||
          (fraction === existing.coverage &&
            descriptor.sortKey.localeCompare(existing.sortKey) < 0)))
    ) {
      bestPerGroup.set(descriptor.group, candidate);
    }
  }

  return [...bestPerGroup.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.coverage - left.coverage ||
      left.sortKey.localeCompare(right.sortKey) ||
      left.text.localeCompare(right.text),
  );
}

/**
 * The feature most over-represented in `here` versus the colliding `peers`,
 * excluding groups already used. Returns undefined when nothing separates
 * them above {@link DISCRIMINATOR_MIN_GAP}.
 */
function bestDiscriminator(
  here: Map<string, number>,
  peers: readonly number[],
  coverages: readonly Map<string, number>[],
  used: ReadonlySet<string>,
  descriptors: Map<string, FeatureDescriptor>,
): FeatureDescriptor | undefined {
  const qualifying: {
    part: FeatureDescriptor;
    gap: number;
    coverage: number;
  }[] = [];

  for (const [key, coverage] of here) {
    if (coverage < DISCRIMINATOR_MIN_COVERAGE) {
      continue;
    }
    const descriptor = descriptors.get(key);
    if (!descriptor || used.has(descriptor.group)) {
      continue;
    }
    let peerMax = 0;
    for (const peer of peers) {
      const peerCoverage = coverages[peer]!.get(key) ?? 0;
      if (peerCoverage > peerMax) {
        peerMax = peerCoverage;
      }
    }
    const gap = coverage - peerMax;
    if (gap < DISCRIMINATOR_MIN_GAP) {
      continue;
    }
    qualifying.push({ part: descriptor, gap, coverage });
  }

  qualifying.sort(
    (left, right) =>
      right.gap - left.gap ||
      right.coverage - left.coverage ||
      left.part.sortKey.localeCompare(right.part.sortKey) ||
      left.part.text.localeCompare(right.part.text),
  );
  return qualifying[0]?.part;
}

/**
 * Render parts to their display string: deterministic sort order, one per line.
 * The stable ordering guarantees collision detection is exact.
 */
function renderLabel(parts: readonly FeatureDescriptor[]): string {
  return [...parts]
    .sort(
      (left, right) =>
        left.sortKey.localeCompare(right.sortKey) ||
        left.text.localeCompare(right.text),
    )
    .map((part) => part.text)
    .join("\n");
}

/**
 * Turn ranked candidates into labels, extending colliding clusters until they
 * separate or the label-part budget is spent.
 */
function resolveLabels(
  clusters: readonly ClusterMembers[],
  candidates: readonly Candidate[][],
  coverages: readonly Map<string, number>[],
  descriptors: Map<string, FeatureDescriptor>,
): Map<ClusterId, string> {
  const chosen: FeatureDescriptor[][] = candidates.map((list) =>
    list.length > 0 ? [list[0]!] : [],
  );
  const used: Set<string>[] = chosen.map(
    (parts) => new Set(parts.map((part) => part.group)),
  );

  const collisions = (): number[][] => {
    const byLabel = new Map<string, number[]>();
    for (let index = 0; index < clusters.length; index++) {
      if (chosen[index]!.length === 0) {
        continue;
      }
      const key = renderLabel(chosen[index]!);
      const bucket = byLabel.get(key);
      if (bucket) {
        bucket.push(index);
      } else {
        byLabel.set(key, [index]);
      }
    }
    return [...byLabel.values()].filter((bucket) => bucket.length > 1);
  };

  // Phase 1: lengthen colliding clusters with their next characteristic candidate.
  for (let pass = 1; pass < MAX_LABEL_PARTS; pass++) {
    const groups = collisions();
    if (groups.length === 0) {
      break;
    }
    let extended = false;
    for (const group of groups) {
      for (const index of group) {
        if (chosen[index]!.length >= MAX_LABEL_PARTS) {
          continue;
        }
        const next = candidates[index]!.find(
          (candidate) => !used[index]!.has(candidate.group),
        );
        if (next) {
          chosen[index]!.push(next);
          used[index]!.add(next.group);
          extended = true;
        }
      }
    }
    if (!extended) {
      break;
    }
  }

  // Phase 2: clusters that still collide share every characteristic feature.
  // Separate them on the feature where they most differ.
  for (let pass = 0; pass < MAX_DISCRIMINATOR_PASSES; pass++) {
    const groups = collisions();
    if (groups.length === 0) {
      break;
    }
    let separated = false;
    for (const group of groups) {
      for (const index of group) {
        if (chosen[index]!.length >= MAX_LABEL_PARTS) {
          continue;
        }
        const peers = group.filter((other) => other !== index);
        const part = bestDiscriminator(
          coverages[index]!,
          peers,
          coverages,
          used[index]!,
          descriptors,
        );
        if (part) {
          chosen[index]!.push(part);
          used[index]!.add(part.group);
          separated = true;
        }
      }
    }
    if (!separated) {
      break;
    }
  }

  const labels = new Map<ClusterId, string>();
  for (let index = 0; index < clusters.length; index++) {
    if (chosen[index]!.length === 0) {
      continue;
    }
    const label = renderLabel(chosen[index]!);
    if (label.length > 0) {
      labels.set(clusters[index]!.childId, label);
    }
  }
  return labels;
}

/**
 * Compute a distinctive label for each cluster. Clusters without a confident
 * distinctive signature are omitted from the result and keep their placeholder.
 */
export function nameClustersByDistinctiveFeatures(
  clusters: readonly ClusterMembers[],
  source: FeatureSource,
): Map<ClusterId, string> {
  const clusterCount = clusters.length;

  const samples = clusters.map((cluster) =>
    subsample(cluster.memberIdxs, MAX_SAMPLE_MEMBERS),
  );

  const ranges = buildNumericRanges(samples, source);

  const descriptors = new Map<string, FeatureDescriptor>();
  const coverages = samples.map((sample) =>
    clusterCoverage(sample, source, ranges, descriptors),
  );

  // Document frequency: how many clusters a feature covers at >= MIN_COVERAGE.
  const documentFrequency = new Map<string, number>();
  for (const coverage of coverages) {
    for (const [key, fraction] of coverage) {
      if (fraction >= MIN_COVERAGE) {
        documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1);
      }
    }
  }

  const candidates = coverages.map((coverage) =>
    rankCandidates(coverage, documentFrequency, clusterCount, descriptors),
  );

  return resolveLabels(clusters, candidates, coverages, descriptors);
}
