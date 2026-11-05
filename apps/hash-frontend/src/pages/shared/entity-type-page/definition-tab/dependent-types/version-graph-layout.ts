import type {
  DependentTypeRow,
  DependentTypeVersionRange,
} from "./dependent-type-rows";

export const pillWidth = 26;
export const pillHeight = 20;
export const parentPillTop = 4;
export const pillTop = 72;
export const graphHeight = 96;
export const ellipsisWidth = 16;

const pillStep = pillWidth + 4;
const ellipsisSpace = ellipsisWidth + 2;
const maxTooltipWidth = 640;

/** Leaves the open column and a margin of the row uncovered. */
const rowInset = 80;

/** An estimate of the width of a 12 px semibold label, for sizing the graph. */
const labelWidth = (text: string) => Math.ceil(text.length * 7.2);

const bandWidth = (versionCount: number) => versionCount * pillStep - 4;

/** Spreads `count` points evenly over `spread` pixels centred on `centre`. */
const spreadAround = (
  centre: number,
  spread: number,
  index: number,
  count: number,
) =>
  count === 1 ? centre : centre - spread / 2 + (index * spread) / (count - 1);

const formatList = (versions: number[]) =>
  versions.map((version) => `v${version}`).join(" and ");

type VersionGraphLayout = {
  width: number;
  parentLabelX: number;
  labelX: number;
  parentPills: { version: number; x: number }[];
  /** The type's versions from its first to its last; a gap extends no parent version. */
  pills: { version: number; x: number; gap: boolean }[];
  lines: { version: number; parentVersion: number; path: string }[];
  /** Where the ellipsis after the parent's versions starts, when the parent has newer versions. */
  parentMoreX: number | null;
  /** Where the ellipsis after the type's versions starts, when the type is former. */
  moreX: number | null;
  summary: string;
};

/**
 * Lays out a dependent type's versions below the parent's versions, with a
 * curve from each version to each parent version it extends.
 */
export const getVersionGraphLayout = ({
  row,
  title,
  parentTitle,
  parentLatestVersion,
}: {
  row: Pick<
    DependentTypeRow,
    "former" | "firstVersion" | "lastVersion" | "parentVersions"
  > & {
    ranges: Pick<
      DependentTypeVersionRange,
      "firstVersion" | "lastVersion" | "parentVersion"
    >[];
  };
  title: string;
  parentTitle: string;
  parentLatestVersion: number;
}): VersionGraphLayout => {
  const parentFrom = Math.min(...row.parentVersions);
  const parentTo = Math.max(...row.parentVersions);
  const parentBandWidth = bandWidth(parentTo - parentFrom + 1);
  const typeBandWidth = bandWidth(row.lastVersion - row.firstVersion + 1);
  const pillsWidth = Math.max(parentBandWidth, typeBandWidth);
  const parentLeft = Math.round((pillsWidth - parentBandWidth) / 2);
  const typeLeft = Math.round((pillsWidth - typeBandWidth) / 2);

  const parentVersionsByVersion = new Map<number, number[]>();
  for (const {
    firstVersion,
    lastVersion,
    parentVersion,
  } of row.ranges.toSorted(
    (left, right) => left.parentVersion - right.parentVersion,
  )) {
    for (let version = firstVersion; version <= lastVersion; version += 1) {
      parentVersionsByVersion.set(version, [
        ...(parentVersionsByVersion.get(version) ?? []),
        parentVersion,
      ]);
    }
  }

  const parentPills = Array.from(
    { length: parentTo - parentFrom + 1 },
    (_, index) => ({
      version: parentFrom + index,
      x: parentLeft + index * pillStep,
    }),
  );
  const pills = Array.from(
    { length: row.lastVersion - row.firstVersion + 1 },
    (_, index) => {
      const version = row.firstVersion + index;
      return {
        version,
        x: typeLeft + index * pillStep,
        gap: !parentVersionsByVersion.has(version),
      };
    },
  );

  const edges = pills.flatMap(({ version, x }) => {
    const parentVersions = parentVersionsByVersion.get(version) ?? [];
    return parentVersions.map((parentVersion, index) => ({
      version,
      parentVersion,
      startX: spreadAround(x + pillWidth / 2, 8, index, parentVersions.length),
      endX: 0,
    }));
  });

  for (const { version: parentVersion, x } of parentPills) {
    const into = edges
      .filter((edge) => edge.parentVersion === parentVersion)
      .sort(
        (left, right) =>
          left.startX - right.startX || left.version - right.version,
      );
    for (const [index, edge] of into.entries()) {
      edge.endX = spreadAround(x + pillWidth / 2, 16, index, into.length);
    }
  }

  const parentBottom = parentPillTop + pillHeight;
  const middle = (pillTop + parentBottom) / 2;
  const lines = edges.map(({ version, parentVersion, startX, endX }) => ({
    version,
    parentVersion,
    path: `M ${startX} ${pillTop} C ${startX} ${middle} ${endX} ${middle} ${endX} ${parentBottom}`,
  }));

  const parentHasMore = parentLatestVersion > parentTo;
  const parentEnd = parentLeft + parentBandWidth;
  const typeEnd = typeLeft + typeBandWidth;

  const versionParts = pills.map(({ version, gap }) =>
    gap
      ? `v${version} doesn't extend ${parentTitle} now`
      : `v${version} extends ${parentTitle} ${formatList(parentVersionsByVersion.get(version) ?? [])}`,
  );
  const summary = [
    `${title}: ${versionParts.join("; ")}.`,
    ...(parentHasMore
      ? [`${parentTitle} has versions newer than v${parentTo}.`]
      : []),
    ...(row.former
      ? [`${title} has newer versions that don't extend ${parentTitle} now.`]
      : []),
  ].join(" ");

  return {
    width: Math.max(
      parentEnd + (parentHasMore ? ellipsisSpace : 0),
      typeEnd + (row.former ? ellipsisSpace : 0),
      parentLeft + labelWidth(parentTitle),
      typeLeft + labelWidth(title),
    ),
    parentLabelX: parentLeft,
    labelX: typeLeft,
    parentPills,
    pills,
    lines,
    parentMoreX: parentHasMore ? parentEnd + 2 : null,
    moreX: row.former ? typeEnd + 2 : null,
    summary,
  };
};

export const getVersionGraphTooltipMaxWidth = (rowWidth: number) =>
  Math.min(maxTooltipWidth, rowWidth - rowInset);
