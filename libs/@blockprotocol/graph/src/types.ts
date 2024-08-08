import { validateBaseUrl } from "@blockprotocol/type-system";

import type { OntologyTypeRecordId } from "./types/ontology.js";

export * from "./types/block-graph.js";
export * from "./types/entity.js";
export * from "./types/file.js";
export * from "./types/ontology.js";
export * from "./types/subgraph.js";
export * from "./types/temporal-versioning.js";

export const isOntologyTypeRecordId = (
  recordId: unknown,
): recordId is OntologyTypeRecordId => {
  return (
    recordId != null &&
    typeof recordId === "object" &&
    "baseUrl" in recordId &&
    typeof recordId.baseUrl === "string" &&
    validateBaseUrl(recordId.baseUrl).type === "Ok" &&
    "version" in recordId &&
    typeof recordId.version === "number"
  );
};
