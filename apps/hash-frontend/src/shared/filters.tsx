import { MultiFilter } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system";

type Filter = NonNullable<MultiFilter["filters"]>[number];

export const entityHasEntityTypeByVersionedUrlFilter = (
  entityTypeId: VersionedUrl,
): Filter => ({
  field: ["metadata", "entityTypeId"],
  operator: "EQUALS",
  value: entityTypeId,
});
