import type {
  DependentType,
  DependentTypeIndex,
  DependentTypeVersion,
} from "./get-dependent-types";
import type { VersionedUrl } from "@blockprotocol/type-system";

export type DependentTypeVersionRange = {
  firstVersion: number;
  lastVersion: number;
  lastVersionId: VersionedUrl;
  parentVersion: number;
};

export type DependentTypeRow = Omit<
  DependentType,
  "versionsByParentVersion"
> & {
  firstVersion: number;
  lastVersion: number;
  parentVersions: number[];
  ranges: DependentTypeVersionRange[];
};

const byNumber = (left: number, right: number) => left - right;

/**
 * Splits the versions of one type that extend one parent version into runs of
 * consecutive version numbers.
 */
const toRanges = (
  versions: DependentTypeVersion[],
  parentVersion: number,
): DependentTypeVersionRange[] => {
  const ranges: DependentTypeVersionRange[] = [];

  for (const { version, entityTypeId } of versions.toSorted(
    (left, right) => left.version - right.version,
  )) {
    const previous = ranges.at(-1);

    if (previous && previous.lastVersion + 1 === version) {
      previous.lastVersion = version;
      previous.lastVersionId = entityTypeId;
    } else {
      ranges.push({
        firstVersion: version,
        lastVersion: version,
        lastVersionId: entityTypeId,
        parentVersion,
      });
    }
  }

  return ranges;
};

const toRow = ({
  versionsByParentVersion,
  ...dependentType
}: DependentType): DependentTypeRow => {
  const ranges = [...versionsByParentVersion]
    .flatMap(([parentVersion, versions]) => toRanges(versions, parentVersion))
    .sort(
      (left, right) =>
        left.firstVersion - right.firstVersion ||
        left.parentVersion - right.parentVersion,
    );

  return {
    ...dependentType,
    firstVersion: Math.min(...ranges.map((range) => range.firstVersion)),
    lastVersion: Math.max(...ranges.map((range) => range.lastVersion)),
    parentVersions: [...versionsByParentVersion.keys()].sort(byNumber),
    ranges,
  };
};

/** One row per current and former dependent type, sorted by title. */
export const getDependentTypeRows = ({
  byType,
}: DependentTypeIndex): DependentTypeRow[] =>
  [...byType.values()]
    .map(toRow)
    .sort((left, right) =>
      left.entityType.schema.title.localeCompare(
        right.entityType.schema.title,
        undefined,
        { numeric: true },
      ),
    );
