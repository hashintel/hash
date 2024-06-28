import {
  extractBaseUrl,
  extractVersion,
  getReferencedIdsFromEntityType,
  getReferencedIdsFromPropertyType,
} from "@blockprotocol/type-system/slim";
import isEqual from "lodash.isequal";

import { unionOfIntervals } from "../../stdlib";
import type { EntityId } from "../../types/entity";
import type {
  EntityIdWithInterval,
  EntityVertexId,
  OntologyTypeRevisionId,
  OntologyTypeVertexId,
  OutwardEdge,
  Subgraph,
} from "../../types/subgraph";
import {
  isEntityTypeVertex,
  isEntityVertex,
  isPropertyTypeVertex,
} from "../../types/subgraph";

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph}  by adding the given {@link OutwardEdge} to `edges` object from the
 * given element at the specified point.
 *
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding the outward edge
 * @param {EntityId | BaseUrl} sourceBaseId – the id of the element the edge is coming from
 * @param {string} at – the identifier for the revision, or the timestamp, at which the edge was added
 * @param {OutwardEdge} outwardEdge – the edge itself
 */
export const addOutwardEdgeToSubgraphByMutation = (
  subgraph: Subgraph,
  sourceBaseId: EntityId,
  at: OntologyTypeRevisionId,
  outwardEdge: OutwardEdge,
) => {
  /* eslint-disable no-param-reassign -- We want to mutate the input here */
  subgraph.edges[sourceBaseId] ??= {};
  subgraph.edges[sourceBaseId]![at] ??= [];
  const outwardEdgesAtVersion: OutwardEdge[] =
    subgraph.edges[sourceBaseId]![at]!;

  if (
    !outwardEdgesAtVersion.find((otherOutwardEdge: OutwardEdge) =>
      isEqual(otherOutwardEdge, outwardEdge),
    )
  ) {
    outwardEdgesAtVersion.push(outwardEdge);
  }
  /* eslint-enable no-param-reassign */
};

/**
 * @todo - with the introduction of non-primitive data types edges will need to be added here
 *
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by creating any ontology related edges that are **directly implied** by the given data type ids (see note below).
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * *Note*: This only creates edges when both endpoints are present in the {@link Subgraph} regardless of whether the data types reference more vertices.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding edges
 * @param {OntologyTypeVertexId[]} dataTypeVertexIds - the IDs of the data types to resolve edges for
 */
export const inferDataTypeEdgesInSubgraphByMutation = (
  _subgraph: Subgraph,
  _dataTypeVertexIds: OntologyTypeVertexId[],
) => {};

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by creating any ontology related edges that are **directly implied** by them (see note below).
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * *Note*: This only creates edges when both endpoints are present in the {@link Subgraph} regardless of whether the property types reference more vertices.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding edges
 * @param {OntologyTypeVertexId[]} propertyTypeVertexIds - the IDs of the property types to resolve edges for
 */
export const inferPropertyTypeEdgesInSubgraphByMutation = (
  subgraph: Subgraph,
  propertyTypeVertexIds: OntologyTypeVertexId[],
) => {
  for (const {
    baseId: baseUrl,
    revisionId: version,
  } of propertyTypeVertexIds) {
    const vertex = subgraph.vertices[baseUrl]?.[version];

    if (!vertex) {
      return undefined;
    }

    if (!isPropertyTypeVertex(vertex)) {
      throw new Error(`expected property type vertex but got: ${vertex.kind}`);
    }

    const { constrainsValuesOnDataTypes, constrainsPropertiesOnPropertyTypes } =
      getReferencedIdsFromPropertyType(vertex.inner.schema);

    for (const { edgeKind, endpoints } of [
      {
        edgeKind: "CONSTRAINS_VALUES_ON" as const,
        endpoints: constrainsValuesOnDataTypes,
      },
      {
        edgeKind: "CONSTRAINS_PROPERTIES_ON" as const,
        endpoints: constrainsPropertiesOnPropertyTypes,
      },
    ]) {
      for (const versionedUrl of endpoints) {
        const targetBaseUrl = extractBaseUrl(versionedUrl);
        const targetRevisionId = extractVersion(versionedUrl).toString();

        // If the endpoint vertex isn't currently in the subgraph, we won't add the edge.
        // We expect all vertices to be present before adding edges.
        if (!subgraph.vertices[targetBaseUrl]?.[targetRevisionId]) {
          continue;
        }

        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          baseUrl,
          version.toString(),
          {
            kind: edgeKind,
            reversed: false,
            rightEndpoint: {
              baseId: targetBaseUrl,
              revisionId: targetRevisionId,
            },
          },
        );

        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          targetBaseUrl,
          targetRevisionId,
          {
            kind: edgeKind,
            reversed: true,
            rightEndpoint: {
              baseId: baseUrl,
              revisionId: version.toString(),
            },
          },
        );
      }
    }
  }
};

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by creating any ontology related edges that are **directly implied** by them (see note below).
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * *Note*: This only creates edges when both endpoints are present in the {@link Subgraph} regardless of whether the entity types reference more vertices.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding edges
 * @param {OntologyTypeVertexId[]} entityTypeVertexIds - the IDs of the entity types to resolve edges for
 */
export const inferEntityTypeEdgesInSubgraphByMutation = (
  subgraph: Subgraph,
  entityTypeVertexIds: OntologyTypeVertexId[],
) => {
  for (const { baseId: baseUrl, revisionId: version } of entityTypeVertexIds) {
    const vertex = subgraph.vertices[baseUrl]?.[version];

    if (!vertex) {
      return undefined;
    }

    if (!isEntityTypeVertex(vertex)) {
      throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
    }

    const {
      constrainsPropertiesOnPropertyTypes,
      constrainsLinksOnEntityTypes,
      constrainsLinkDestinationsOnEntityTypes,
    } = getReferencedIdsFromEntityType(vertex.inner.schema);

    for (const { edgeKind, endpoints } of [
      {
        edgeKind: "CONSTRAINS_PROPERTIES_ON" as const,
        endpoints: constrainsPropertiesOnPropertyTypes,
      },
      {
        edgeKind: "CONSTRAINS_LINKS_ON" as const,
        endpoints: constrainsLinksOnEntityTypes,
      },
      {
        edgeKind: "CONSTRAINS_LINK_DESTINATIONS_ON" as const,
        endpoints: constrainsLinkDestinationsOnEntityTypes,
      },
    ]) {
      for (const versionedUrl of endpoints) {
        const targetBaseUrl = extractBaseUrl(versionedUrl);
        const targetRevisionId = extractVersion(versionedUrl).toString();

        // If the endpoint vertex isn't currently in the subgraph, we won't add the edge.
        // We expect all vertices to be present before adding edges.
        if (!subgraph.vertices[targetBaseUrl]?.[targetRevisionId]) {
          continue;
        }

        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          baseUrl,
          version.toString(),
          {
            kind: edgeKind,
            reversed: false,
            rightEndpoint: {
              baseId: targetBaseUrl,
              revisionId: targetRevisionId,
            },
          },
        );

        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          targetBaseUrl,
          targetRevisionId,
          {
            kind: edgeKind,
            reversed: true,
            rightEndpoint: {
              baseId: baseUrl,
              revisionId: version.toString(),
            },
          },
        );
      }
    }
  }
};

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by creating any link edges and ontology related edges that are **directly implied** by the entities in the list (see note below).
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * *Note*: This only creates edges when both endpoints are present in the {@link Subgraph} regardless of whether the entities reference more vertices.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding edges
 * @param {EntityVertexId[]} entityVertexIds - the IDs of the entities to resolve edges for
 */
export const inferEntityEdgesInSubgraphByMutation = (
  subgraph: Subgraph,
  entityVertexIds: EntityVertexId[],
) => {
  /*
   * @todo This assumes that the left and right entity ID of a link entity is static for its entire lifetime, that is
   *   not necessarily going to continue being the case
   */

  const linkMap: Record<
    EntityId,
    {
      leftEntityId: EntityId;
      rightEntityId: EntityId;
      edgeIntervals: EntityIdWithInterval["interval"][];
    }
  > = {};

  for (const {
    baseId: entityId,
    revisionId: intervalStartLimit,
  } of entityVertexIds) {
    const vertex = subgraph.vertices[entityId]?.[intervalStartLimit];

    if (!vertex) {
      return undefined;
    }

    if (!isEntityVertex(vertex)) {
      throw new Error(`expected entity vertex but got: ${vertex.kind}`);
    }
    /*
        this cast should be safe as we have just checked if the Subgraph has temporal information, in which case the
        entities should too
      */
    const entity = vertex.inner;
    const entityInterval: EntityIdWithInterval["interval"] =
      entity.metadata.temporalVersioning[
        subgraph.temporalAxes.resolved.variable.axis
      ];

    const entityTypeId = vertex.inner.metadata.entityTypeId;
    const entityTypeBaseUrl = extractBaseUrl(entityTypeId);
    const entityTypeRevisionId = extractVersion(entityTypeId).toString();

    // If the entity type vertex is currently in the subgraph, we add the appropriate edge.
    // We expect all vertices to be present before adding edges.
    if (subgraph.vertices[entityTypeBaseUrl]?.[entityTypeRevisionId]) {
      // Add IS_OF_TYPE edges for the entity and entity type
      addOutwardEdgeToSubgraphByMutation(
        subgraph,
        entityId,
        intervalStartLimit,
        {
          kind: "IS_OF_TYPE",
          reversed: false,
          rightEndpoint: {
            baseId: entityTypeBaseUrl,
            revisionId: entityTypeRevisionId.toString(),
          },
        },
      );

      addOutwardEdgeToSubgraphByMutation(
        subgraph,
        entityTypeBaseUrl,
        entityTypeRevisionId,
        {
          kind: "IS_OF_TYPE",
          reversed: true,
          rightEndpoint: {
            entityId,
            interval: entityInterval,
          },
        },
      );
    }

    if (entity.linkData) {
      const linkInfo = linkMap[entityId];
      if (!linkInfo) {
        linkMap[entityId] = {
          leftEntityId: entity.linkData.leftEntityId,
          rightEntityId: entity.linkData.rightEntityId,
          edgeIntervals: [entityInterval],
        };
      } else {
        if (
          linkMap[entityId]!.leftEntityId !== entity.linkData.leftEntityId &&
          linkMap[entityId]!.rightEntityId !== entity.linkData.rightEntityId
        ) {
          /*
           * @todo This assumes that the left and right entity ID of a link entity is static for its entire lifetime, that is
           *   not necessarily going to continue being the case
           */
          throw new Error(
            `Link entity ${entityId} has multiple left and right entities`,
          );
        }
        linkInfo.edgeIntervals.push(
          entity.metadata.temporalVersioning[
            subgraph.temporalAxes.resolved.variable.axis
          ],
        );
      }
    }

    for (const [
      linkEntityId,
      { leftEntityId, rightEntityId, edgeIntervals },
    ] of Object.entries(linkMap)) {
      // If the list of entities is comprehensive, and link destinations cannot change, the result of this should be an
      // array with a single interval that spans the full lifespan of the link entity.
      const unionedIntervals = unionOfIntervals(...edgeIntervals);

      for (const edgeInterval of unionedIntervals) {
        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          linkEntityId,
          edgeInterval.start.limit,
          {
            kind: "HAS_LEFT_ENTITY",
            reversed: false,
            rightEndpoint: { entityId: leftEntityId, interval: edgeInterval },
          },
        );
        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          leftEntityId,
          edgeInterval.start.limit,
          {
            kind: "HAS_LEFT_ENTITY",
            reversed: true,
            rightEndpoint: { entityId: linkEntityId, interval: edgeInterval },
          },
        );
        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          linkEntityId,
          edgeInterval.start.limit,
          {
            kind: "HAS_RIGHT_ENTITY",
            reversed: false,
            rightEndpoint: {
              entityId: rightEntityId,
              interval: edgeInterval,
            },
          },
        );
        addOutwardEdgeToSubgraphByMutation(
          subgraph,
          rightEntityId,
          edgeInterval.start.limit,
          {
            kind: "HAS_RIGHT_ENTITY",
            reversed: true,
            rightEndpoint: { entityId: linkEntityId, interval: edgeInterval },
          },
        );
      }
    }
  }
};
