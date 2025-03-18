import type { OntologyTypeRecordId } from "@blockprotocol/type-system";
import { validateBaseUrl } from "@blockprotocol/type-system";

export * from "./ontology/data-type.js";
export * from "./ontology/entity-type.js";
export * from "./ontology/property-type.js";

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
