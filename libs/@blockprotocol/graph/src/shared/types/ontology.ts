import { BaseUrl, validateBaseUrl } from "@blockprotocol/type-system/slim";

export * from "./ontology/data-type.js";
export * from "./ontology/entity-type.js";
export * from "./ontology/metadata.js";
export * from "./ontology/property-type.js";

/** @todo - Add documentation */
/**
 *  @todo - Do we want to introduce "ontology" into code? Alternatives:
 *    * `TypeRecordId` - "type" is so ambiguous in languages and tends to clash with protected keywords
 *    * `TypeSystemElementId` - This is about as wordy as below, and is an element of the ontology the same as an element
 *      of the type system? Not sure the type system == ontology, it's more like the type system describes the ontology.
 */
export type OntologyTypeRecordId = {
  baseUrl: BaseUrl;
  version: number;
};

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
export type OntologyTypeRevisionId = string; // we explicitly opt not to use `${number}`
