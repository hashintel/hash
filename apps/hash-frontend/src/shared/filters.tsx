import type { MultiFilter } from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { extractBaseUrl } from "@blockprotocol/type-system";

type Filter = NonNullable<MultiFilter["filters"]>[number];

export const entityHasEntityTypeByVersionedUrlFilter = (
  entityTypeId: VersionedUrl,
): Filter => ({
  /** @todo update these filters */
  field: ["metadata", "entityTypeId"],
  operator: "EQUALS",
  value: entityTypeId,
});

export const entityHasEntityTypeByBaseUrlFilter = (
  entityTypeId: VersionedUrl,
): Filter => ({
  field: ["metadata", "entityTypeBaseUrl"],
  operator: "EQUALS",
  value: extractBaseUrl(entityTypeId),
});
