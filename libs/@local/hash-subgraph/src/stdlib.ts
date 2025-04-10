/**
 * The extended standard library of functions for interacting with a {@link Subgraph}.
 */
export { getPropertyTypesReferencedByEntityType } from "./stdlib/subgraph/edge/entity-type.js";
export {
  getIncomingLinkAndSourceEntities,
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "./stdlib/subgraph/edge/link-entity.js";
export {
  getDataTypeById,
  getDataTypeByVertexId,
  getDataTypes,
  getDataTypesByBaseUrl,
  getJsonSchemaTypeFromValue,
} from "./stdlib/subgraph/element/data-type.js";
export {
  extractActorIdFromActorEntityId,
  extractWebIdFromActorEntityId,
  getEntities,
  getEntityRevision,
  getEntityRevisionsByEntityId,
} from "./stdlib/subgraph/element/entity.js";
export {
  getBreadthFirstEntityTypesAndParents,
  getEntityTypeAndDescendantsById,
  getEntityTypeAndParentsById,
  getEntityTypeById,
  getEntityTypeByVertexId,
  getEntityTypes,
  getEntityTypesByBaseUrl,
} from "./stdlib/subgraph/element/entity-type.js";
export {
  getPossibleLinkTypesForEntityType,
  isLinkEntityType,
} from "./stdlib/subgraph/element/link-type.js";
export { mapElementsIntoRevisions } from "./stdlib/subgraph/element/map-revisions.js";
export {
  getPropertyTypeById,
  getPropertyTypeByVertexId,
  getPropertyTypeForEntity,
  getPropertyTypes,
  getPropertyTypesByBaseUrl,
  getPropertyTypesForEntityType,
  guessSchemaForPropertyValue,
} from "./stdlib/subgraph/element/property-type.js";
export * from "./stdlib/subgraph/roots.js";
