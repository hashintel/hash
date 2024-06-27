import type { Entity } from "../../types/entity.js";
import type {
  DataTypeVertex,
  DataTypeWithMetadata,
  EntityIdWithInterval,
  EntityTypeVertex,
  EntityTypeWithMetadata,
  EntityVertex,
  EntityVertexId,
  OntologyTypeVertexId,
  PropertyTypeVertex,
  PropertyTypeWithMetadata,
  Subgraph,
} from "../../types/subgraph.js";

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by adding a given list of data types to the vertices.
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding the provided entities
 * @param {DataTypeWithMetadata[]} dataTypes – the data types to add to the provided subgraph
 * @returns {OntologyTypeVertexId[]} – the vertex IDs of the data type vertices that were added
 */
export const addDataTypeVerticesToSubgraphByMutation = (
  subgraph: Subgraph,
  dataTypes: DataTypeWithMetadata[],
): OntologyTypeVertexId[] => {
  const vertexIds: OntologyTypeVertexId[] = [];
  /* eslint-disable no-param-reassign -- We want to mutate the input here */
  for (const dataType of dataTypes) {
    const { baseUrl, version } = dataType.metadata.recordId;

    const dataTypeVertex: DataTypeVertex = {
      kind: "dataType",
      inner: dataType,
    };

    subgraph.vertices[baseUrl] ??= {};
    subgraph.vertices[baseUrl]![version] = dataTypeVertex;

    vertexIds.push({ baseId: baseUrl, revisionId: version.toString() });
  }
  /* eslint-enable no-param-reassign */
  return vertexIds;
};

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by adding a given list of property types to the vertices.
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding the provided entities
 * @param {PropertyTypeWithMetadata[]} propertyTypes – the data types to add to the provided subgraph
 * @returns {OntologyTypeVertexId[]} – the vertex IDs of the property type vertices that were added
 */
export const addPropertyTypeVerticesToSubgraphByMutation = (
  subgraph: Subgraph,
  propertyTypes: PropertyTypeWithMetadata[],
): OntologyTypeVertexId[] => {
  const vertexIds: OntologyTypeVertexId[] = [];
  /* eslint-disable no-param-reassign -- We want to mutate the input here */
  for (const propertyType of propertyTypes) {
    const { baseUrl, version } = propertyType.metadata.recordId;

    const propertyTypeVertex: PropertyTypeVertex = {
      kind: "propertyType",
      inner: propertyType,
    };

    subgraph.vertices[baseUrl] ??= {};
    subgraph.vertices[baseUrl]![version] = propertyTypeVertex;

    vertexIds.push({ baseId: baseUrl, revisionId: version.toString() });
  }
  /* eslint-enable no-param-reassign */
  return vertexIds;
};

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by adding a given list of entity types to the vertices.
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding the provided entities
 * @param {EntityTypeWithMetadata[]} entityTypes – the data types to add to the provided subgraph
 * @returns {OntologyTypeVertexId[]} – the vertex IDs of the entity type vertices that were added
 */
export const addEntityTypeVerticesToSubgraphByMutation = (
  subgraph: Subgraph,
  entityTypes: EntityTypeWithMetadata[],
): OntologyTypeVertexId[] => {
  const vertexIds: OntologyTypeVertexId[] = [];
  /* eslint-disable no-param-reassign -- We want to mutate the input here */
  for (const entityType of entityTypes) {
    const { baseUrl, version } = entityType.metadata.recordId;

    const entityTypeVertex: EntityTypeVertex = {
      kind: "entityType",
      inner: entityType,
    };

    subgraph.vertices[baseUrl] ??= {};
    subgraph.vertices[baseUrl]![version] = entityTypeVertex;

    vertexIds.push({ baseId: baseUrl, revisionId: version.toString() });
  }
  /* eslint-enable no-param-reassign */
  return vertexIds;
};

/**
 * Looking to build a subgraph? You probably want {@link buildSubgraph} from `@blockprotocol/graph/stdlib`
 *
 * This MUTATES the given {@link Subgraph} by adding a given list of entities to the vertices.
 * Mutating a Subgraph is unsafe in most situations – you should know why you need to do it.
 *
 * @param {Subgraph} subgraph – the subgraph to mutate by adding the provided entities
 * @param {Entity[]} entities – the entities to add to the provided subgraph
 * @returns {EntityVertexId[]} – the vertex IDs of the added entities
 */
export const addEntityVerticesToSubgraphByMutation = (
  subgraph: Subgraph,
  entities: Entity[],
): EntityVertexId[] => {
  const vertexIds: EntityVertexId[] = [];
  /* eslint-disable no-param-reassign -- We want to mutate the input here */
  for (const entity of entities) {
    const entityId = entity.metadata.recordId.entityId;

    /*
        this cast should be safe as we have just checked if the Subgraph has temporal information, in which case the
        entities should too
      */
    const entityInterval: EntityIdWithInterval["interval"] =
      entity.metadata.temporalVersioning[
        subgraph.temporalAxes.resolved.variable.axis
      ];

    const entityVertex: EntityVertex = {
      kind: "entity",
      inner: entity,
    };

    if (!subgraph.vertices[entityId]) {
      subgraph.vertices[entityId] = {
        [entityInterval.start.limit]: entityVertex,
      };
    } else {
      subgraph.vertices[entityId]![entityInterval.start.limit] = entityVertex;
    }

    vertexIds.push({
      baseId: entityId,
      revisionId: entityInterval.start.limit,
    });
  }
  /* eslint-enable no-param-reassign */
  return vertexIds;
};
