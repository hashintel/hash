import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";

import type { DependentTypeRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const typeId = (title: string, version: number) =>
  `https://example.com/@alice/types/entity-type/${title.toLowerCase().replaceAll(" ", "-")}/v/${version}` as VersionedUrl;

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
  };
};
