/**
 * Defines the main entrypoint to the standard library for the Block Protocol Graph Module package, with support for
 * temporal versioning.
 *
 * This defines a collection of helper functions and utilities for interacting with elements of the graph.
 */

import {
  buildSubgraph as buildSubgraphGeneral,
  compareBounds as compareBoundsGeneral,
  getDataTypeById as getDataTypeByIdGeneral,
  getDataTypeByVertexId as getDataTypeByVertexIdGeneral,
  getDataTypes as getDataTypesGeneral,
  getDataTypesByBaseUrl as getDataTypesByBaseUrlGeneral,
  getDataTypesReferencedByPropertyType as getDataTypesReferencedByPropertyTypeGeneral,
  getEntities as getEntitiesGeneral,
  getEntityRevision as getEntityRevisionGeneral,
  getEntityRevisionsByEntityId as getEntityRevisionsByEntityIdGeneral,
  getEntityTypeById as getEntityTypeByIdGeneral,
  getEntityTypeByVertexId as getEntityTypeByVertexIdGeneral,
  getEntityTypes as getEntityTypesGeneral,
  getEntityTypesByBaseUrl as getEntityTypesByBaseUrlGeneral,
  getEntityTypesReferencedByEntityType as getEntityTypesReferencedByEntityTypeGeneral,
  getIncomingLinksForEntity as getIncomingLinksForEntityGeneral,
  getLatestInstantIntervalForSubgraph as getLatestInstantIntervalForSubgraphGeneral,
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
  intervalCompareWithInterval as intervalCompareWithIntervalGeneral,
  intervalContainsInterval as intervalContainsIntervalGeneral,
  intervalContainsTimestamp as intervalContainsTimestampGeneral,
  intervalForTimestamp as intervalForTimestampGeneral,
  intervalIntersectionWithInterval as intervalIntersectionWithIntervalGeneral,
  intervalIsAdjacentToInterval as intervalIsAdjacentToIntervalGeneral,
  intervalIsStrictlyAfterInterval as intervalIsStrictlyAfterIntervalGeneral,
  intervalIsStrictlyBeforeInterval as intervalIsStrictlyBeforeIntervalGeneral,
  intervalMergeWithInterval as intervalMergeWithIntervalGeneral,
  intervalOverlapsInterval as intervalOverlapsIntervalGeneral,
  intervalUnionWithInterval as intervalUnionWithIntervalGeneral,
  isDataTypeRootedSubgraph as isDataTypeRootedSubgraphGeneral,
  isEntityRootedSubgraph as isEntityRootedSubgraphGeneral,
  isEntityTypeRootedSubgraph as isEntityTypeRootedSubgraphGeneral,
  isPropertyTypeRootedSubgraph as isPropertyTypeRootedSubgraphGeneral,
  mapElementsIntoRevisions as mapElementsIntoRevisionsGeneral,
  parseLabelFromEntity as parseLabelFromEntityGeneral,
  sortIntervals as sortIntervalsGeneral,
  unionOfIntervals as unionOfIntervalsGeneral,
} from "../shared/stdlib.js";
import { type BaseIdToRevisions } from "../shared/stdlib/subgraph/element/map-revisions.js";
import {
  type DataTypeWithMetadata,
  type Entity,
  type EntityId,
  type EntityRecordId,
  type EntityRevisionId,
  type EntityTypeWithMetadata,
  type GraphElementVertexId,
  type GraphResolveDepths,
  type LinkEntityAndRightEntity,
  type OntologyTypeRecordId,
  type PropertyTypeWithMetadata,
  type Subgraph,
  type SubgraphRootType,
  type SubgraphTemporalAxes,
  type TimeInterval,
  type Vertex,
} from "./main.js";

export const compareBounds = compareBoundsGeneral;
export const intervalCompareWithInterval = intervalCompareWithIntervalGeneral;
export const intervalContainsInterval = intervalContainsIntervalGeneral;
export const intervalContainsTimestamp = intervalContainsTimestampGeneral;
export const intervalForTimestamp = intervalForTimestampGeneral;
export const intervalIntersectionWithInterval =
  intervalIntersectionWithIntervalGeneral;
export const intervalIsAdjacentToInterval = intervalIsAdjacentToIntervalGeneral;
export const intervalIsStrictlyAfterInterval =
  intervalIsStrictlyAfterIntervalGeneral;
export const intervalIsStrictlyBeforeInterval =
  intervalIsStrictlyBeforeIntervalGeneral;
export const intervalMergeWithInterval = intervalMergeWithIntervalGeneral;
export const intervalOverlapsInterval = intervalOverlapsIntervalGeneral;
export const intervalUnionWithInterval = intervalUnionWithIntervalGeneral;
export const sortIntervals = sortIntervalsGeneral;
export const unionOfIntervals = unionOfIntervalsGeneral;
export const buildSubgraph = (
  data: {
    entities: Entity[];
    entityTypes: EntityTypeWithMetadata[];
    propertyTypes: PropertyTypeWithMetadata[];
    dataTypes: DataTypeWithMetadata[];
  },
  rootRecordIds: (EntityRecordId | OntologyTypeRecordId)[],
  depths: GraphResolveDepths,
  subgraphTemporalAxes: SubgraphTemporalAxes,
) =>
  buildSubgraphGeneral<true>(data, rootRecordIds, depths, subgraphTemporalAxes);
export const inferSubgraphEdges = (subgraph: Subgraph) =>
  inferSubgraphEdgesGeneral<true>(subgraph);

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
  interval?: TimeInterval,
) => getIncomingLinksForEntityGeneral<true>(subgraph, entityId, interval);
export const getLeftEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
) => getLeftEntityForLinkEntityGeneral<true>(subgraph, entityId, interval);
export const getOutgoingLinkAndTargetEntities = <
  LinkAndRightEntities extends
    LinkEntityAndRightEntity[] = LinkEntityAndRightEntity[],
>(
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): LinkAndRightEntities =>
  getOutgoingLinkAndTargetEntitiesGeneral<true, LinkAndRightEntities>(
    subgraph,
    entityId,
    interval,
  );
export const getOutgoingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
) => getOutgoingLinksForEntityGeneral<true>(subgraph, entityId, interval);
export const getRightEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
) => getRightEntityForLinkEntityGeneral<true>(subgraph, entityId, interval);
export const getDataTypeById = getDataTypeByIdGeneral;
export const getDataTypeByVertexId = getDataTypeByVertexIdGeneral;
export const getDataTypes = getDataTypesGeneral;
export const getDataTypesByBaseUrl = getDataTypesByBaseUrlGeneral;
export const getEntities = (subgraph: Subgraph, latest: boolean = false) =>
  getEntitiesGeneral<true>(subgraph, latest);
export const getEntityRevision = (
  subgraph: Subgraph,
  entityId: EntityId,
  targetRevisionInformation?: EntityRevisionId | Date,
) =>
  getEntityRevisionGeneral<true>(subgraph, entityId, targetRevisionInformation);
export const getEntityRevisionsByEntityId = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
) => getEntityRevisionsByEntityIdGeneral<true>(subgraph, entityId, interval);
export const getEntityTypeById = getEntityTypeByIdGeneral;
export const getEntityTypeByVertexId = getEntityTypeByVertexIdGeneral;
export const getEntityTypes = getEntityTypesGeneral;
export const getEntityTypesByBaseUrl = getEntityTypesByBaseUrlGeneral;
export const mapElementsIntoRevisions = <
  GraphElementType extends Vertex["inner"],
>(
  elements: GraphElementType[],
): BaseIdToRevisions<true, GraphElementType> =>
  mapElementsIntoRevisionsGeneral<true, GraphElementType>(elements);
export const getPropertyTypeById = getPropertyTypeByIdGeneral;
export const getPropertyTypeByVertexId = getPropertyTypeByVertexIdGeneral;
export const getPropertyTypes = getPropertyTypesGeneral;
export const getPropertyTypesByBaseUrl = getPropertyTypesByBaseUrlGeneral;
export const getRoots = <RootType extends SubgraphRootType>(
  subgraph: Subgraph<RootType>,
): RootType["element"][] => getRootsGeneral<true, RootType>(subgraph);
export const getVertexIdForRecordId = (
  subgraph: Subgraph,
  recordId: EntityRecordId | OntologyTypeRecordId,
): GraphElementVertexId => getVertexIdForRecordIdGeneral(subgraph, recordId);
export const isDataTypeRootedSubgraph = isDataTypeRootedSubgraphGeneral<true>;
export const isEntityRootedSubgraph = isEntityRootedSubgraphGeneral<true>;
export const isEntityTypeRootedSubgraph =
  isEntityTypeRootedSubgraphGeneral<true>;
export const isPropertyTypeRootedSubgraph =
  isPropertyTypeRootedSubgraphGeneral<true>;
export const getLatestInstantIntervalForSubgraph =
  getLatestInstantIntervalForSubgraphGeneral<true>;
export const parseLabelFromEntity = (
  entityToLabel: Entity,
  subgraph: Subgraph,
) => parseLabelFromEntityGeneral<true>(entityToLabel, subgraph);
