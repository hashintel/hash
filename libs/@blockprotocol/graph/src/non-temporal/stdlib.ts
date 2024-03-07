/**
 * Defines the main entrypoint to the standard library for the Block Protocol Graph Module package, without support for
 * temporal versioning.
 *
 * This defines a collection of helper functions and utilities for interacting with elements of the graph.
 *
 * Some commented out imports, and exports, are consciously left in the file as a quick indicator of what exports are
 * different from the entrypoint of the package _with_ temporal support.
 */

import {
  buildSubgraph as buildSubgraphGeneral,
  getDataTypeById as getDataTypeByIdGeneral,
  getDataTypeByVertexId as getDataTypeByVertexIdGeneral,
  getDataTypes as getDataTypesGeneral,
  getDataTypesByBaseUrl as getDataTypesByBaseUrlGeneral,
  getDataTypesReferencedByPropertyType as getDataTypesReferencedByPropertyTypeGeneral,
  getEntities as getEntitiesGeneral,
  getEntityRevision as getEntityRevisionGeneral,
  getEntityTypeById as getEntityTypeByIdGeneral,
  getEntityTypeByVertexId as getEntityTypeByVertexIdGeneral,
  getEntityTypes as getEntityTypesGeneral,
  getEntityTypesByBaseUrl as getEntityTypesByBaseUrlGeneral,
  getEntityTypesReferencedByEntityType as getEntityTypesReferencedByEntityTypeGeneral,
  getIncomingLinksForEntity as getIncomingLinksForEntityGeneral,
  getLeftEntityForLinkEntity as getLeftEntityForLinkEntityGeneral,
  getOutgoingLinkAndTargetEntities as getOutgoingLinkAndTargetEntitiesGeneral,
  getOutgoingLinksForEntity as getOutgoingLinksForEntityGeneral,
  getPropertyTypeById as getPropertyTypeByIdGeneral,
  getPropertyTypeByVertexId as getPropertyTypeByVertexIdGeneral,
  getPropertyTypes as getPropertyTypesGeneral,
  getPropertyTypesByBaseUrl as getPropertyTypesByBaseUrlGeneral,
  getPropertyTypesReferencedByEntityType as getPropertyTypesReferencedByEntityTypeGeneral,
  getPropertyTypesReferencedByPropertyType as getPropertyTypesReferencedByPropertyTypeGeneral,
  getRightEntityForLinkEntity as getRightEntityForLinkEntityGeneral,
  getRoots as getRootsGeneral,
  getVertexIdForRecordId as getVertexIdForRecordIdGeneral,
  inferSubgraphEdges as inferSubgraphEdgesGeneral,
  isDataTypeRootedSubgraph as isDataTypeRootedSubgraphGeneral,
  isEntityRootedSubgraph as isEntityRootedSubgraphGeneral,
  isEntityTypeRootedSubgraph as isEntityTypeRootedSubgraphGeneral,
  isPropertyTypeRootedSubgraph as isPropertyTypeRootedSubgraphGeneral,
  parseLabelFromEntity as parseLabelFromEntityGeneral,
} from "../shared/stdlib.js";
import {
  type DataTypeWithMetadata,
  type Entity,
  type EntityId,
  type EntityRecordId,
  type EntityTypeWithMetadata,
  type GraphElementVertexId,
  type GraphResolveDepths,
  type LinkEntityAndRightEntity,
  type OntologyTypeRecordId,
  type PropertyTypeWithMetadata,
  type Subgraph,
  type SubgraphRootType,
} from "./main.js";
// import {
//   EntityRevisionId,
//   TimeInterval,
//   Timestamp,
// } from "./main.js";
// import {
//   getEntityRevisionsByEntityId as getEntityRevisionsByEntityIdGeneral,
//   intervalCompareWithInterval as intervalCompareWithIntervalGeneral,
//   intervalContainsInterval as intervalContainsIntervalGeneral,
//   intervalContainsTimestamp as intervalContainsTimestampGeneral,
//   intervalForTimestamp as intervalForTimestampGeneral,
//   intervalIntersectionWithInterval as intervalIntersectionWithIntervalGeneral,
//   intervalIsAdjacentToInterval as intervalIsAdjacentToIntervalGeneral,
//   intervalIsStrictlyAfterInterval as intervalIsStrictlyAfterIntervalGeneral,
//   intervalIsStrictlyBeforeInterval as intervalIsStrictlyBeforeIntervalGeneral,
//   intervalMergeWithInterval as intervalMergeWithIntervalGeneral,
//   intervalOverlapsInterval as intervalOverlapsIntervalGeneral,
//   intervalUnionWithInterval as intervalUnionWithIntervalGeneral,
//   sortIntervals as sortIntervalsGeneral,
//   unionOfIntervals as unionOfIntervalsGeneral,
// } from "../shared/stdlib.js";

// export const compareBounds = compareBoundsGeneral;
// export const intervalCompareWithInterval = intervalCompareWithIntervalGeneral;
// export const intervalContainsInterval = intervalContainsIntervalGeneral;
// export const intervalContainsTimestamp = intervalContainsTimestampGeneral;
// export const intervalForTimestamp = intervalForTimestampGeneral;
// export const intervalIntersectionWithInterval =
//   intervalIntersectionWithIntervalGeneral;
// export const intervalIsAdjacentToInterval = intervalIsAdjacentToIntervalGeneral;
// export const intervalIsStrictlyAfterInterval =
//   intervalIsStrictlyAfterIntervalGeneral;
// export const intervalIsStrictlyBeforeInterval =
//   intervalIsStrictlyBeforeIntervalGeneral;
// export const intervalMergeWithInterval = intervalMergeWithIntervalGeneral;
// export const intervalOverlapsInterval = intervalOverlapsIntervalGeneral;
// export const intervalUnionWithInterval = intervalUnionWithIntervalGeneral;
// export const sortIntervals = sortIntervalsGeneral;
// export const unionOfIntervals = unionOfIntervalsGeneral;
export const buildSubgraph = (
  data: {
    entities: Entity[];
    entityTypes: EntityTypeWithMetadata[];
    propertyTypes: PropertyTypeWithMetadata[];
    dataTypes: DataTypeWithMetadata[];
  },
  rootRecordIds: (EntityRecordId | OntologyTypeRecordId)[],
  depths: GraphResolveDepths,
) => buildSubgraphGeneral<false>(data, rootRecordIds, depths, undefined);
export const inferSubgraphEdges = (subgraph: Subgraph) =>
  inferSubgraphEdgesGeneral<false>(subgraph);

export const getPropertyTypesReferencedByEntityType =
  getPropertyTypesReferencedByEntityTypeGeneral;
export const getEntityTypesReferencedByEntityType =
  getEntityTypesReferencedByEntityTypeGeneral;
export const getPropertyTypesReferencedByPropertyType =
  getPropertyTypesReferencedByPropertyTypeGeneral;
export const getDataTypesReferencedByPropertyType =
  getDataTypesReferencedByPropertyTypeGeneral;
export const getIncomingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
) =>
  getIncomingLinksForEntityGeneral<false>(subgraph, entityId, undefined, true);
export const getLeftEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
) =>
  getLeftEntityForLinkEntityGeneral<false>(
    subgraph,
    entityId,
    undefined,
    true,
  )?.pop();
export const getOutgoingLinkAndTargetEntities = <
  LinkAndRightEntities extends
    LinkEntityAndRightEntity[] = LinkEntityAndRightEntity[],
>(
  subgraph: Subgraph,
  entityId: EntityId,
): LinkAndRightEntities =>
  getOutgoingLinkAndTargetEntitiesGeneral<false, LinkAndRightEntities>(
    subgraph,
    entityId,
    undefined,
    true,
  );
export const getOutgoingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
) =>
  getOutgoingLinksForEntityGeneral<false>(subgraph, entityId, undefined, true);
export const getRightEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
) =>
  getRightEntityForLinkEntityGeneral<false>(
    subgraph,
    entityId,
    undefined,
    true,
  )?.pop();
export const getDataTypeById = getDataTypeByIdGeneral;
export const getDataTypeByVertexId = getDataTypeByVertexIdGeneral;
export const getDataTypes = getDataTypesGeneral;
export const getDataTypesByBaseUrl = getDataTypesByBaseUrlGeneral;
export const getEntities = (subgraph: Subgraph) =>
  getEntitiesGeneral<false>(subgraph, true);
export const getEntityRevision = (subgraph: Subgraph, entityId: EntityId) =>
  getEntityRevisionGeneral<false>(subgraph, entityId);
// export const getEntityRevisionsByEntityId = (
//   subgraph: Subgraph,
//   entityId: EntityId,
// ) => getEntityRevisionsByEntityIdGeneral<false>(subgraph, entityId);
export const getEntityTypeById = getEntityTypeByIdGeneral;
export const getEntityTypeByVertexId = getEntityTypeByVertexIdGeneral;
export const getEntityTypes = getEntityTypesGeneral;
export const getEntityTypesByBaseUrl = getEntityTypesByBaseUrlGeneral;
// export const mapElementsIntoRevisions = <
//   GraphElementType extends Vertex["inner"],
// >(
//   elements: GraphElementType[],
// ) => mapElementsIntoRevisionsGeneral<false, GraphElementType>(elements);
export const getPropertyTypeById = getPropertyTypeByIdGeneral;
export const getPropertyTypeByVertexId = getPropertyTypeByVertexIdGeneral;
export const getPropertyTypes = getPropertyTypesGeneral;
export const getPropertyTypesByBaseUrl = getPropertyTypesByBaseUrlGeneral;
export const getRoots = <RootType extends SubgraphRootType>(
  subgraph: Subgraph<RootType>,
): RootType["element"][] => getRootsGeneral<false, RootType>(subgraph);
export const getVertexIdForRecordId = (
  subgraph: Subgraph,
  recordId: EntityRecordId | OntologyTypeRecordId,
): GraphElementVertexId => getVertexIdForRecordIdGeneral(subgraph, recordId);
export const isDataTypeRootedSubgraph = isDataTypeRootedSubgraphGeneral<false>;
export const isEntityRootedSubgraph = isEntityRootedSubgraphGeneral<false>;
export const isEntityTypeRootedSubgraph =
  isEntityTypeRootedSubgraphGeneral<false>;
export const isPropertyTypeRootedSubgraph =
  isPropertyTypeRootedSubgraphGeneral<false>;
// export const getLatestInstantIntervalForSubgraph =
//   getLatestInstantIntervalForSubgraphGeneral<false>;
export const parseLabelFromEntity = (
  entityToLabel: Entity,
  subgraph: Subgraph,
) => parseLabelFromEntityGeneral<false>(entityToLabel, subgraph);
