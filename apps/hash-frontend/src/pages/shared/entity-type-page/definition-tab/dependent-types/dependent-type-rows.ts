import { extractBaseUrl, extractVersion } from "@blockprotocol/type-system";

import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

type QueryEntityTypesResult = {
  entityTypes: EntityTypeWithMetadata[];
  cursor?: VersionedUrl | null;
};

type DependentTypeVersionRange = {
  firstVersion: number;
  lastVersion: number;
  lastVersionId: VersionedUrl;
  parentVersion: number;
};

export type DependentTypeRow = {
  /** The type's latest version. */
  entityType: EntityTypeWithMetadata;
  firstVersion: number;
  lastVersion: number;
  parentVersions: number[];
  ranges: DependentTypeVersionRange[];
};

type DependentTypeVersion = { version: number; entityTypeId: VersionedUrl };

const versionNumber = (entityTypeId: VersionedUrl) =>
  Number.parseInt(extractVersion(entityTypeId).toString(), 10);

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

export const getDependentTypeRows = ({
  parentBaseUrl,
  allVersions,
  latestVersions,
}: {
  parentBaseUrl: BaseUrl;
  allVersions: QueryEntityTypesResult;
  latestVersions: QueryEntityTypesResult;
}): {
  rows: DependentTypeRow[];
  /** Whether either query stopped at the Graph's row limit, so rows or versions can be missing. */
  incomplete: boolean;
} => {
  /** For each dependent type, the versions of it that extend each parent version. */
  const versionsByParentVersion = new Map<
    BaseUrl,
    Map<number, DependentTypeVersion[]>
  >();

  const seenIds = new Set<VersionedUrl>();

  for (const { schema, metadata } of allVersions.entityTypes) {
    if (
      metadata.recordId.baseUrl === parentBaseUrl ||
      seenIds.has(schema.$id)
    ) {
      continue;
    }
    seenIds.add(schema.$id);

    for (const { $ref } of schema.allOf ?? []) {
      if (extractBaseUrl($ref) !== parentBaseUrl) {
        continue;
      }

      const byParentVersion =
        versionsByParentVersion.get(metadata.recordId.baseUrl) ??
        new Map<number, DependentTypeVersion[]>();
      versionsByParentVersion.set(metadata.recordId.baseUrl, byParentVersion);

      const parentVersion = versionNumber($ref);
      byParentVersion.set(parentVersion, [
        ...(byParentVersion.get(parentVersion) ?? []),
        { version: versionNumber(schema.$id), entityTypeId: schema.$id },
      ]);
    }
  }

  const rows: DependentTypeRow[] = [];
  const listedBaseUrls = new Set<BaseUrl>();

  for (const entityType of latestVersions.entityTypes) {
    const { baseUrl } = entityType.metadata.recordId;
    const byParentVersion = versionsByParentVersion.get(baseUrl);

    if (!byParentVersion || listedBaseUrls.has(baseUrl)) {
      continue;
    }
    listedBaseUrls.add(baseUrl);

    const ranges = [...byParentVersion]
      .flatMap(([parentVersion, versions]) => toRanges(versions, parentVersion))
      .sort(
        (left, right) =>
          left.firstVersion - right.firstVersion ||
          left.parentVersion - right.parentVersion,
      );

    rows.push({
      entityType,
      firstVersion: Math.min(...ranges.map((range) => range.firstVersion)),
      lastVersion: Math.max(...ranges.map((range) => range.lastVersion)),
      parentVersions: [...byParentVersion.keys()].sort(
        (left, right) => left - right,
      ),
      ranges,
    });
  }

  rows.sort((left, right) =>
    left.entityType.schema.title.localeCompare(
      right.entityType.schema.title,
      undefined,
      { numeric: true },
    ),
  );

  return {
    rows,
    incomplete: !!allVersions.cursor || !!latestVersions.cursor,
  };
};
