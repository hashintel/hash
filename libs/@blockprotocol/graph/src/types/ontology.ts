import type { OntologyTypeRecordId } from "@blockprotocol/type-system";
import { validateBaseUrl } from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";

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

/**
 * The second component of the [{@link BaseUrl}, RevisionId] tuple needed to identify a specific ontology type vertex
 * within a {@link Subgraph}. This should be the version number as a string.
 *
 * Although it would be possible to create a template literal type, this confuses TypeScript when traversing the
 * {@link Subgraph} in generic contexts, whereby it then thinks any string must relate to a {@link EntityVertex}.
 */
export type OntologyTypeRevisionId = Brand<string, "OntologyTypeRevisionId">; // we explicitly opt not to use `${number}`
