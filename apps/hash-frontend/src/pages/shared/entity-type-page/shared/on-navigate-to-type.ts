import type { VersionedUrl } from "@blockprotocol/type-system";

export type OnNavigateToType = (
  kind: "entityType" | "dataType",
  url: VersionedUrl,
) => void;
