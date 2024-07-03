/**
 * The extended standard library of functions for interacting with a {@link Subgraph}.
 */
export { compareBounds } from "./stdlib/bound.js";
export {
  intervalCompareWithInterval,
  intervalContainsInterval,
  intervalContainsTimestamp,
  intervalForTimestamp,
  intervalIntersectionWithInterval,
  intervalIsAdjacentToInterval,
  intervalIsStrictlyAfterInterval,
  intervalIsStrictlyBeforeInterval,
  intervalMergeWithInterval,
  intervalOverlapsInterval,
  intervalUnionWithInterval,
  sortIntervals,
  unionOfIntervals,
} from "./stdlib/interval.js";
export { getPropertyTypesReferencedByEntityType } from "./stdlib/subgraph/edge/entity-type.js";
export {
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
  getEntities,
  getEntityRevision,
  getEntityRevisionsByEntityId,
} from "./stdlib/subgraph/element/entity.js";
export {
  getEntityTypeAndDescendantsById,
  getEntityTypeAndParentsById,
  getEntityTypeById,
  getEntityTypeByVertexId,
  getEntityTypes,
  getEntityTypesByBaseUrl,
} from "./stdlib/subgraph/element/entity-type.js";
export { mapElementsIntoRevisions } from "./stdlib/subgraph/element/map-revisions.js";
export {
  getPropertyTypeById,
  getPropertyTypeByVertexId,
  getPropertyTypeForEntity,
  getPropertyTypes,
  getPropertyTypesByBaseUrl,
  guessSchemaForPropertyValue,
} from "./stdlib/subgraph/element/property-type.js";
export * from "./stdlib/subgraph/roots.js";
export { getLatestInstantIntervalForSubgraph } from "./stdlib/subgraph/temporal-axes.js";
