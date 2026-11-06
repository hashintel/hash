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

export type DependentTypeVersion = {
  version: number;
  entityTypeId: VersionedUrl;
};

export type DependentType = {
  /**
   * The type's latest version, or for a former dependent its highest version
   * that extends the parent.
   */
  entityType: EntityTypeWithMetadata;
  /** The version number of `entityType`. */
  version: number;
  /** Whether the type's latest version no longer extends the parent, or is archived. */
  former: boolean;
  /** The type's versions that extend each version of the parent. */
  versionsByParentVersion: Map<number, DependentTypeVersion[]>;
};

export type DependentTypes = {
  /** Current and former dependent types. */
  byType: Map<BaseUrl, DependentType>;
  /** Whether either query stopped at the Graph's row limit, so types or versions can be missing. */
  incomplete: boolean;
};

const versionNumber = (entityTypeId: VersionedUrl) =>
  Number.parseInt(extractVersion(entityTypeId).toString(), 10);

/** Groups the versions that extend the parent by their type. */
export const getDependentTypes = ({
  parentBaseUrl,
  allVersions,
  latestVersions,
}: {
  parentBaseUrl: BaseUrl;
  allVersions: QueryEntityTypesResult;
  latestVersions: QueryEntityTypesResult;
}): DependentTypes => {
  const latestByBaseUrl = new Map<BaseUrl, EntityTypeWithMetadata>();

  for (const entityType of latestVersions.entityTypes) {
    const { baseUrl } = entityType.metadata.recordId;

    if (!latestByBaseUrl.has(baseUrl)) {
      latestByBaseUrl.set(baseUrl, entityType);
    }
  }

  const byType = new Map<BaseUrl, DependentType>();
  const seenIds = new Set<VersionedUrl>();

  for (const entityType of allVersions.entityTypes) {
    const { schema, metadata } = entityType;
    const { baseUrl } = metadata.recordId;
    const latest = latestByBaseUrl.get(baseUrl);

    if (
      baseUrl === parentBaseUrl ||
      seenIds.has(schema.$id) ||
      // A type missing from a cut-off latest-version query can still be current.
      (!latest && !!latestVersions.cursor)
    ) {
      continue;
    }
    seenIds.add(schema.$id);

    const version = versionNumber(schema.$id);

    for (const { $ref } of schema.allOf ?? []) {
      if (extractBaseUrl($ref) !== parentBaseUrl) {
        continue;
      }

      const parentVersion = versionNumber($ref);

      const dependentType: DependentType = byType.get(baseUrl) ?? {
        entityType: latest ?? entityType,
        version: latest ? versionNumber(latest.schema.$id) : version,
        former: !latest,
        versionsByParentVersion: new Map(),
      };
      byType.set(baseUrl, dependentType);

      if (dependentType.former && version > dependentType.version) {
        dependentType.entityType = entityType;
        dependentType.version = version;
      }

      const versions =
        dependentType.versionsByParentVersion.get(parentVersion) ?? [];
      dependentType.versionsByParentVersion.set(parentVersion, versions);
      versions.push({ version, entityTypeId: schema.$id });
    }
  }

  return {
    byType,
    incomplete: !!allVersions.cursor || !!latestVersions.cursor,
  };
};
