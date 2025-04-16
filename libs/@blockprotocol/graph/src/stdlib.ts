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
export { buildSubgraph } from "./stdlib/subgraph/builder.js";
export {
  getEntityTypesReferencedByEntityType,
  getPropertyTypesReferencedByEntityType,
} from "./stdlib/subgraph/edge/entity-type.js";
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
} from "./stdlib/subgraph/element/data-type.js";
export {
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
export { mapElementsIntoRevisions } from "./stdlib/subgraph/element/map-revisions.js";
export {
  getPropertyTypeById,
  getPropertyTypeByVertexId,
  getPropertyTypeForEntity,
  getPropertyTypes,
  getPropertyTypesByBaseUrl,
  getPropertyTypesForEntityType,
} from "./stdlib/subgraph/element/property-type.js";
export {
  getRoots,
  isDataTypeRootedSubgraph,
  isEntityRootedSubgraph,
  isEntityTypeRootedSubgraph,
  isPropertyTypeRootedSubgraph,
} from "./stdlib/subgraph/roots.js";
export { getLatestInstantIntervalForSubgraph } from "./stdlib/subgraph/temporal-axes.js";
export { getVertexIdForRecordId } from "./stdlib/subgraph/vertex-id-for-element.js";
