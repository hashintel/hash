/**
 * The extended standard library of functions for interacting with a {@link Subgraph}.
 */
export { compareBounds } from "./stdlib/bound";
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
} from "./stdlib/interval";
export { getPropertyTypesReferencedByEntityType } from "./stdlib/subgraph/edge/entity-type";
export {
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "./stdlib/subgraph/edge/link-entity";
export {
  getDataTypeById,
  getDataTypeByVertexId,
  getDataTypes,
  getDataTypesByBaseUrl,
  getJsonSchemaTypeFromValue,
} from "./stdlib/subgraph/element/data-type";
export {
  getEntities,
  getEntityRevision,
  getEntityRevisionsByEntityId,
} from "./stdlib/subgraph/element/entity";
export {
  getEntityTypeAndDescendantsById,
  getEntityTypeAndParentsById,
  getEntityTypeById,
  getEntityTypeByVertexId,
  getEntityTypes,
  getEntityTypesByBaseUrl,
} from "./stdlib/subgraph/element/entity-type";
export { mapElementsIntoRevisions } from "./stdlib/subgraph/element/map-revisions";
export {
  getPropertyTypeById,
  getPropertyTypeByVertexId,
  getPropertyTypeForEntity,
  getPropertyTypes,
  getPropertyTypesByBaseUrl,
  guessSchemaForPropertyValue,
} from "./stdlib/subgraph/element/property-type";
export * from "./stdlib/subgraph/roots";
export { getLatestInstantIntervalForSubgraph } from "./stdlib/subgraph/temporal-axes";
