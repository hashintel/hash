/**
 * The extended standard library of functions for interacting with a {@link Subgraph}.
 */
export { compareBounds } from "./stdlib/bound.js";
export { parseLabelFromEntity } from "./stdlib/entity.js";
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
export {
  buildSubgraph,
  inferSubgraphEdges,
} from "./stdlib/subgraph/builder.js";
export {
  getEntityTypesReferencedByEntityType,
  getPropertyTypesReferencedByEntityType,
} from "./stdlib/subgraph/edge/entity-type.js";
export {
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "./stdlib/subgraph/edge/link-entity.js";
export {
  getDataTypesReferencedByPropertyType,
  getPropertyTypesReferencedByPropertyType,
} from "./stdlib/subgraph/edge/property-type.js";
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
  getEntityTypeById,
  getEntityTypeByVertexId,
  getEntityTypes,
  getEntityTypesByBaseUrl,
} from "./stdlib/subgraph/element/entity-type.js";
export { mapElementsIntoRevisions } from "./stdlib/subgraph/element/map-revisions.js";
export {
  getPropertyTypeById,
  getPropertyTypeByVertexId,
  getPropertyTypes,
  getPropertyTypesByBaseUrl,
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
