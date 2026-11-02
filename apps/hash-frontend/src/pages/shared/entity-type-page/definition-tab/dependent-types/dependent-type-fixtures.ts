import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";

import type { DependentTypeRow } from "./dependent-type-rows";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const typeBaseUrl = (slug: string) =>
  `https://example.com/@alice/types/entity-type/${slug}/` as BaseUrl;

export const actorBaseUrl = typeBaseUrl("actor");

/** Version `version` of `slug`, whose `allOf` names the given versions of the parent, Actor by default. */
export const makeVersion = (
  slug: string,
  title: string,
  version: number,
  parentVersions: number[],
  parentBaseUrl: BaseUrl = actorBaseUrl,
): EntityTypeWithMetadata =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: `${typeBaseUrl(slug)}v/${version}` as VersionedUrl,
      title,
      description: `A ${title}`,
      type: "object",
      properties: {},
      allOf: parentVersions.map((parentVersion) => ({
        $ref: `${parentBaseUrl}v/${parentVersion}` as VersionedUrl,
      })),
    },
    metadata: {
      recordId: { baseUrl: typeBaseUrl(slug), version: `${version}` },
    },
  }) as unknown as EntityTypeWithMetadata;

export const typeId = (title: string, version: number) =>
  `${typeBaseUrl(title.toLowerCase().replaceAll(" ", "-"))}v/${version}` as VersionedUrl;

/**
 * A row for `title`, named by version `version`, with ranges given as
 * `[firstVersion, lastVersion, parentVersion]`.
 */
export const makeRow = (
  title: string,
  version: number,
  ranges: [number, number, number][],
  former = false,
): DependentTypeRow => {
  const versions = new Map<number, number[]>();
  for (const [first, last, parent] of ranges) {
    for (let current = first; current <= last; current += 1) {
      versions.set(current, [...(versions.get(current) ?? []), parent]);
    }
  }

  return {
    entityType: {
      schema: {
        $schema: ENTITY_TYPE_META_SCHEMA,
        kind: "entityType",
        $id: typeId(title, version),
        title,
        description: `A ${title}`,
        type: "object",
        properties: {},
      },
    } as EntityTypeWithMetadata,
    version,
    former,
    firstVersion: Math.min(...ranges.map(([first]) => first)),
    lastVersion: Math.max(...ranges.map(([, last]) => last)),
    parentVersions: [...new Set(ranges.map(([, , parent]) => parent))].sort(),
    ranges: ranges.map(([firstVersion, lastVersion, parentVersion]) => ({
      firstVersion,
      lastVersion,
      lastVersionId: typeId(title, lastVersion),
      parentVersion,
    })),
    versions: [...versions]
      .map(([current, parentVersions]) => ({
        version: current,
        parentVersions,
      }))
      .sort((left, right) => left.version - right.version),
  };
};
