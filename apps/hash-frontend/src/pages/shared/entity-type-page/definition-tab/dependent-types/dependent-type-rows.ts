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

export type DependentTypeVersionRange = {
  firstVersion: number;
  lastVersion: number;
  lastVersionId: VersionedUrl;
  parentVersion: number;
};

export type DependentTypeRow = {
  /**
   * The type's latest version, or for a former dependent its highest version
   * that extends the parent.
   */
  entityType: EntityTypeWithMetadata;
  /** The version number of `entityType`. */
  version: number;
  /** Whether the type's latest version no longer extends the parent, or is archived. */
  former: boolean;
  firstVersion: number;
  lastVersion: number;
  parentVersions: number[];
  ranges: DependentTypeVersionRange[];
};

type DependentTypeVersion = { version: number; entityTypeId: VersionedUrl };

const versionNumber = (entityTypeId: VersionedUrl) =>
  Number.parseInt(extractVersion(entityTypeId).toString(), 10);

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

/** Everything the first query returned about one dependent type. */
type DependentTypeEdges = {
  highestVersion: EntityTypeWithMetadata;
  byParentVersion: Map<number, DependentTypeVersion[]>;
};

const toRow = (
  entityType: EntityTypeWithMetadata,
  former: boolean,
  { byParentVersion }: DependentTypeEdges,
): DependentTypeRow => {
  const ranges = [...byParentVersion]
    .flatMap(([parentVersion, versions]) => toRanges(versions, parentVersion))
    .sort(
      (left, right) =>
        left.firstVersion - right.firstVersion ||
        left.parentVersion - right.parentVersion,
    );

  return {
    entityType,
    version: versionNumber(entityType.schema.$id),
    former,
    firstVersion: Math.min(...ranges.map((range) => range.firstVersion)),
    lastVersion: Math.max(...ranges.map((range) => range.lastVersion)),
    parentVersions: [...byParentVersion.keys()].sort(byNumber),
    ranges,
  };
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
  /** Current dependents and former dependents, sorted by title. */
  rows: DependentTypeRow[];
  /** Whether either query stopped at the Graph's row limit, so rows or versions can be missing. */
  incomplete: boolean;
} => {
  const edgesByBaseUrl = new Map<BaseUrl, DependentTypeEdges>();
  const seenIds = new Set<VersionedUrl>();

  for (const entityType of allVersions.entityTypes) {
    const { schema, metadata } = entityType;
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

      const version = versionNumber(schema.$id);
      const parentVersion = versionNumber($ref);

      const edges = edgesByBaseUrl.get(metadata.recordId.baseUrl) ?? {
        highestVersion: entityType,
        byParentVersion: new Map(),
      };
      edgesByBaseUrl.set(metadata.recordId.baseUrl, edges);

      if (version > versionNumber(edges.highestVersion.schema.$id)) {
        edges.highestVersion = entityType;
      }
      edges.byParentVersion.set(parentVersion, [
        ...(edges.byParentVersion.get(parentVersion) ?? []),
        { version, entityTypeId: schema.$id },
      ]);
    }
  }

  const rows: DependentTypeRow[] = [];
  const currentBaseUrls = new Set<BaseUrl>();

  for (const entityType of latestVersions.entityTypes) {
    const { baseUrl } = entityType.metadata.recordId;
    const edges = edgesByBaseUrl.get(baseUrl);

    if (!edges || currentBaseUrls.has(baseUrl)) {
      continue;
    }
    currentBaseUrls.add(baseUrl);

    rows.push(toRow(entityType, false, edges));
  }

  if (!latestVersions.cursor) {
    for (const [baseUrl, edges] of edgesByBaseUrl) {
      if (!currentBaseUrls.has(baseUrl)) {
        rows.push(toRow(edges.highestVersion, true, edges));
      }
    }
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
