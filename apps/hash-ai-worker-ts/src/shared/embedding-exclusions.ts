import { extractBaseUrl } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * Entities of these types never get embeddings. Matched by base URL so that
 * entities which haven't been upgraded to the latest type version are skipped too.
 */
export const entityTypeBaseUrlsExcludedFromEmbeddings = [
  systemEntityTypes.flowRun.entityTypeBaseUrl,
];

export const isEntityExcludedFromEmbeddings = (entityTypeIds: VersionedUrl[]) =>
  entityTypeIds.some((entityTypeId) =>
    entityTypeBaseUrlsExcludedFromEmbeddings.includes(
      extractBaseUrl(entityTypeId),
    ),
  );
