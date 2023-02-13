import {
  DataType,
  EntityType,
  OneOf,
  PropertyType,
  PropertyValues,
  validateBaseUri,
  validateVersionedUri,
  VersionedUri,
} from "@blockprotocol/type-system";
import {
  DataType as DataTypeGraphApi,
  EntityType as EntityTypeGraphApi,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  OntologyElementMetadata as OntologyElementMetadataGraphApi,
  OntologyVertex as OntologyVertexGraphApi,
  PropertyType as PropertyTypeGraphApi,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import {
  EntityId,
  EntityPropertiesObject,
  isEntityId,
  KnowledgeGraphVertex,
  OntologyElementMetadata,
  OntologyVertex,
  Timestamp,
  UpdatedById,
  Vertices,
} from "@local/hash-subgraph/main";

const mapDataType = (dataType: DataTypeGraphApi): DataType => {
  const idResult = validateVersionedUri(dataType.$id);
  if (idResult.type === "Err") {
    throw new Error(
      `Expected type ID to be a Versioned URI:\n${JSON.stringify(
        idResult.inner,
      )}`,
    );
  }
  const { inner: $id } = idResult;

  return {
    ...dataType,
    $id,
  };
};

const mapPropertyType = (propertyType: PropertyTypeGraphApi): PropertyType => {
  if (propertyType.oneOf.length < 1) {
    throw new Error(
      `Property Type had an empty one of:\n${JSON.stringify(propertyType)}`,
    );
  }

  const idResult = validateVersionedUri(propertyType.$id);
  if (idResult.type === "Err") {
    throw new Error(
      `Expected type ID to be a Versioned URI:\n${JSON.stringify(
        idResult.inner,
      )}`,
    );
  }
  const { inner: $id } = idResult;

  return {
    ...propertyType,
    $id,
    // We checked the length above
    oneOf: propertyType.oneOf as OneOf<PropertyValues>["oneOf"],
  };
};

const mapEntityType = (entityType: EntityTypeGraphApi): EntityType => {
  /** @todo - The OpenAPI spec generator fails to appropriately type `properties` or `links` */
  return entityType as EntityType;
};

const mapOntologyMetadata = (
  metadata: OntologyElementMetadataGraphApi,
): OntologyElementMetadata => {
  /* @ts-expect-error -- @todo-0.3 `ownedById` shouldn't be required in the BP ontology metadata */
  return {
    ...metadata,
    recordId: {
      baseUri: metadata.editionId.baseId,
      version: metadata.editionId.version,
    },
    provenance: {
      updatedById: metadata.provenance.updatedById as UpdatedById,
    },
  };
};

const mapOntologyVertex = (vertex: OntologyVertexGraphApi): OntologyVertex => {
  switch (vertex.kind) {
    case "dataType": {
      return {
        kind: vertex.kind,
        inner: {
          ...vertex.inner,
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapDataType(vertex.inner.schema),
        },
      };
    }
    case "propertyType": {
      return {
        kind: vertex.kind,
        inner: {
          ...vertex.inner,
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapPropertyType(vertex.inner.schema),
        },
      };
    }
    case "entityType": {
      return {
        kind: vertex.kind,
        inner: {
          ...vertex.inner,
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapEntityType(vertex.inner.schema),
        },
      };
    }
  }
};

const mapKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertexGraphApi,
): KnowledgeGraphVertex => {
  return {
    ...vertex,
    inner: {
      ...vertex.inner,
      properties: vertex.inner.properties as EntityPropertiesObject,
      ...(vertex.inner.linkData
        ? {
            linkData: {
              leftEntityId: vertex.inner.linkData.leftEntityId as EntityId,
              rightEntityId: vertex.inner.linkData.rightEntityId as EntityId,
              leftToRightOrder: vertex.inner.linkData.leftToRightOrder,
              rightToLeftOrder: vertex.inner.linkData.rightToLeftOrder,
            },
          }
        : ({} as { linkData: never })),
      metadata: {
        ...vertex.inner.metadata,
        recordId: {
          entityId: vertex.inner.metadata.editionId.baseId as EntityId,
          editionId: vertex.inner.metadata.editionId.recordId,
        },
        entityTypeId: vertex.inner.metadata.entityTypeId as VersionedUri,
        temporalVersioning: {
          transactionTime: {
            start: {
              kind: "inclusive",
              limit: vertex.inner.metadata.version.transactionTime
                .start as Timestamp,
            },
            end: {
              kind: "exclusive",
              limit: vertex.inner.metadata.version.transactionTime
                .end as Timestamp,
            },
          },
          decisionTime: {
            start: {
              kind: "inclusive",
              limit: vertex.inner.metadata.version.decisionTime
                .start as Timestamp,
            },
            end: {
              kind: "exclusive",
              limit: vertex.inner.metadata.version.decisionTime
                .end as Timestamp,
            },
          },
        },
        provenance: {
          updatedById: vertex.inner.metadata.provenance
            .updatedById as UpdatedById,
        },
      },
    },
  };
};

export const mapVertices = (vertices: VerticesGraphApi): Vertices => {
  const mappedVertices: Vertices = {};

  // Trying to build this with `Object.fromEntries` breaks tsc and leads to `any` typed values
  for (const [baseId, inner] of Object.entries(vertices)) {
    const result = validateBaseUri(baseId);
    if (result.type === "Ok") {
      // ------------ Ontology Type case ----------------
      const baseUri = result.inner;

      mappedVertices[baseUri] = Object.fromEntries(
        Object.entries(inner).map(([version, vertex]) => {
          const versionNumber = Number(version);

          if (Number.isNaN(versionNumber)) {
            throw new Error(
              `Unrecognized ontology type version, expected a number but got: ${version}`,
            );
          }

          if (
            vertex.kind !== "dataType" &&
            vertex.kind !== "propertyType" &&
            vertex.kind !== "entityType"
          ) {
            throw new Error(
              `Expected an ontology vertex but found:\n${JSON.stringify(
                vertex,
              )}`,
            );
          }

          const mappedVertex = mapOntologyVertex(vertex);
          return [versionNumber, mappedVertex];
        }),
      );
    } else if (isEntityId(baseId)) {
      // ------------ Entity (knowledge-graph) case ----------------
      mappedVertices[baseId] = Object.fromEntries(
        Object.entries(inner).map(([version, vertex]) => {
          const timestamp = Date.parse(version);

          if (Number.isNaN(timestamp)) {
            throw new Error(
              `Unrecognized entity version, expected an ISO-formatted timestamp but got: ${version}`,
            );
          }

          if (vertex.kind !== "entity") {
            throw new Error(
              `Expected an entity vertex but found:\n${JSON.stringify(vertex)}`,
            );
          }

          const mappedVertex = mapKnowledgeGraphVertex(vertex);
          return [version, mappedVertex];
        }),
      );
    } else {
      throw new Error(
        `Unrecognized or invalid vertices outer key type: ${baseId}`,
      );
    }
  }

  return mappedVertices;
};
