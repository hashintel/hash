import { MultiFilter } from "@blockprotocol/graph";
import { extractBaseUrl, VersionedUrl } from "@blockprotocol/type-system";

type Filter = NonNullable<MultiFilter["filters"]>[number];

export const entityHasEntityTypeByVersionedUrlFilter = (
  entityTypeId: VersionedUrl,
): Filter => ({
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
