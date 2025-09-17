import type {
  EntityRootType,
  KnowledgeGraphVertex,
  Subgraph,
  SubgraphRootType,
  Vertices,
} from "@blockprotocol/graph";
import { isEntityVertex } from "@blockprotocol/graph";
import type {
  ClosedEntityType,
  ClosedMultiEntityType,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  ClosedEntityType as GraphApiClosedEntityType,
  ClosedMultiEntityType as GraphApiClosedMultiEntityType,
  DataTypeConversionTargets as GraphApiDataTypeConversionTargets,
  EntityTypeResolveDefinitions as GraphApiEntityTypeResolveDefinitions,
  EntityTypeWithMetadata as GraphApiEntityTypeWithMetadata,
  PropertyTypeWithMetadata as GraphApiPropertyTypeWithMetadata,
} from "@local/hash-graph-client";
import type {
  SerializedKnowledgeGraphVertex,
  SerializedSubgraph,
  SerializedVertices,
} from "@local/hash-graph-sdk/entity";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  DataTypeConversionTargets,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-sdk/ontology";

const serializeKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertex<HashEntity>,
) => {
  return {
    kind: vertex.kind,
    inner: vertex.inner.toJSON(),
  } as SerializedKnowledgeGraphVertex;
};

const deserializeKnowledgeGraphVertex = (
  vertex: SerializedKnowledgeGraphVertex,
): KnowledgeGraphVertex<HashEntity> => {
  return {
    kind: vertex.kind,
    inner: new HashEntity(vertex.inner),
  };
};

export const serializeGraphVertices = (vertices: Vertices<HashEntity>) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      Object.fromEntries(
        typedEntries(inner).map(([version, vertex]) => [
          version,
          isEntityVertex(vertex)
            ? serializeKnowledgeGraphVertex(vertex)
            : vertex,
        ]),
      ),
    ]),
  ) as SerializedVertices;

export const deserializeGraphVertices = (
  vertices: SerializedVertices,
): Vertices<HashEntity> =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      Object.fromEntries(
        typedEntries(inner).map(([version, vertex]) => [
          version,
          vertex.kind === "entity"
            ? deserializeKnowledgeGraphVertex(vertex)
            : vertex,
        ]),
      ),
    ]),
  ) as Vertices<HashEntity>;

export const serializeSubgraph = (subgraph: Subgraph): SerializedSubgraph => ({
  roots: subgraph.roots,
  vertices: serializeGraphVertices(subgraph.vertices as Vertices<HashEntity>),
  edges: subgraph.edges,
  temporalAxes: subgraph.temporalAxes,
});

export const deserializeSubgraph = <
  RootType extends
    | Exclude<SubgraphRootType, EntityRootType>
    | EntityRootType<HashEntity>,
>(
  subgraph: SerializedSubgraph,
): Subgraph<RootType, HashEntity> => ({
  roots: subgraph.roots as RootType["vertexId"][],
  vertices: deserializeGraphVertices(subgraph.vertices),
  edges: subgraph.edges,
  temporalAxes: subgraph.temporalAxes,
});

export const mapGraphApiEntityTypesToEntityTypes = (
  entityTypes: GraphApiEntityTypeWithMetadata[],
) => entityTypes as unknown as EntityTypeWithMetadata[];

export const mapGraphApiClosedEntityTypesToClosedEntityTypes = (
  closedEntityTypes: GraphApiClosedEntityType[],
) => closedEntityTypes as ClosedEntityType[];

export const mapGraphApiEntityTypeResolveDefinitionsToEntityTypeResolveDefinitions =
  (entityTypeResolveDefinitions: GraphApiEntityTypeResolveDefinitions) =>
    entityTypeResolveDefinitions as EntityTypeResolveDefinitions;

export const mapGraphApiClosedMultiEntityTypesToClosedMultiEntityTypes = (
  closedMultiEntityTypes: GraphApiClosedMultiEntityType[],
) => closedMultiEntityTypes as ClosedMultiEntityType[];

export const mapGraphApiPropertyTypesToPropertyTypes = (
  propertyTypes: GraphApiPropertyTypeWithMetadata[],
) => propertyTypes as unknown as PropertyTypeWithMetadata[];

export const mapGraphApiDataTypeConversions = (
  conversions: Record<
    string,
    Record<string, GraphApiDataTypeConversionTargets>
  >,
) =>
  conversions as Record<
    VersionedUrl,
    Record<VersionedUrl, DataTypeConversionTargets>
  >;
