import { Brand } from "@local/hash-isomorphic-utils/types";

export * from "./ontology/data-type";
export * from "./ontology/entity-type";
export * from "./ontology/metadata";
export * from "./ontology/property-type";
export {
  type OntologyTypeRecordId,
  isOntologyTypeRecordId,
} from "@blockprotocol/graph";

/**
 * The second component of the [{@link BaseUri}, RevisionId] tuple needed to identify a specific ontology type vertex
 * within a {@link Subgraph}. This should be the version number as a string.
 */
export type OntologyTypeRevisionId = Brand<
  `${number}`,
  "OntologyTypeRevisionId"
>;
